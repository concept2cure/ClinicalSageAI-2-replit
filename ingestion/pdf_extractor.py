"""
Multi-Strategy PDF Text Extractor
=================================

Production-grade PDF text extraction with automatic fallback cascade:
  1. PyMuPDF (fitz) — fastest, best layout preservation for native PDFs
  2. PyPDF2 — fallback for native PDFs if fitz fails
  3. pdfminer.six — layout-aware extraction with better text flow
  4. Tesseract OCR via PyMuPDF — scanned PDFs (300 DPI, plain)
  5. Tesseract OCR + OpenCV — low-quality scans with denoise/binarise
  6. Tesseract OCR via pdf2image — fallback when PyMuPDF unavailable

Standalone image OCR:
  extract_image_ocr() — PNG / JPG / TIFF / BMP / WEBP → text
    • adaptive binarisation + deskew preprocessing
    • multi-PSM fallback for challenging layouts
    • configurable language packs, OEM, DPI

Usage:
    from ingestion.pdf_extractor import extract_pdf_text

    result = extract_pdf_text("/path/to/file.pdf")
    # or
    result = extract_pdf_text(pdf_bytes)

    print(result["text"])         # Extracted text
    print(result["strategy"])     # Which strategy succeeded
    print(result["page_count"])   # Number of pages
    print(result["warnings"])     # Any issues encountered

@module ingestion/pdf_extractor
@version 1.0.0
"""

import io
import logging
import tempfile
import os
from dataclasses import dataclass, field
from typing import Union, List, Optional, Dict, Any
from pathlib import Path

# Configure logging
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# RESULT TYPE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ExtractionResult:
    """Result of PDF text extraction."""
    text: str
    strategy: str
    page_count: int
    char_count: int
    success: bool
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "strategy": self.strategy,
            "page_count": self.page_count,
            "char_count": self.char_count,
            "success": self.success,
            "warnings": self.warnings,
            "metadata": self.metadata,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 1: PyMuPDF (fitz)
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_with_pymupdf(pdf_input: Union[str, bytes]) -> Optional[ExtractionResult]:
    """
    Extract text using PyMuPDF (fitz).
    Best for native PDFs with embedded text — fastest and preserves layout.
    """
    try:
        import fitz  # PyMuPDF

        if isinstance(pdf_input, bytes):
            doc = fitz.open(stream=pdf_input, filetype="pdf")
        else:
            doc = fitz.open(pdf_input)

        text_parts = []
        page_count = len(doc)

        for page_num, page in enumerate(doc):
            try:
                # Extract text with layout preservation
                page_text = page.get_text("text")
                if page_text.strip():
                    text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
            except Exception as e:
                logger.warning(f"PyMuPDF: Page {page_num + 1} extraction error: {e}")

        doc.close()

        full_text = "\n\n".join(text_parts)

        if not full_text.strip():
            return None  # Empty — trigger next strategy

        return ExtractionResult(
            text=full_text,
            strategy="pymupdf",
            page_count=page_count,
            char_count=len(full_text),
            success=True,
            metadata={"library": "PyMuPDF/fitz"}
        )

    except ImportError:
        logger.warning("PyMuPDF not installed")
        return None
    except Exception as e:
        logger.warning(f"PyMuPDF extraction failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 2: PyPDF2
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_with_pypdf2(pdf_input: Union[str, bytes]) -> Optional[ExtractionResult]:
    """
    Extract text using PyPDF2.
    Fallback for native PDFs — simpler but sometimes catches edge cases fitz misses.
    """
    try:
        import PyPDF2

        if isinstance(pdf_input, bytes):
            reader = PyPDF2.PdfReader(io.BytesIO(pdf_input))
        else:
            reader = PyPDF2.PdfReader(pdf_input)

        text_parts = []
        page_count = len(reader.pages)
        warnings = []

        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
            except Exception as e:
                warnings.append(f"Page {page_num + 1}: {str(e)}")
                logger.warning(f"PyPDF2: Page {page_num + 1} extraction error: {e}")

        full_text = "\n\n".join(text_parts)

        if not full_text.strip():
            return None  # Empty — trigger next strategy

        return ExtractionResult(
            text=full_text,
            strategy="pypdf2",
            page_count=page_count,
            char_count=len(full_text),
            success=True,
            warnings=warnings,
            metadata={"library": "PyPDF2"}
        )

    except ImportError:
        logger.warning("PyPDF2 not installed")
        return None
    except Exception as e:
        logger.warning(f"PyPDF2 extraction failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 3: pdfminer.six (layout-aware)
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_with_pdfminer(pdf_input: Union[str, bytes]) -> Optional[ExtractionResult]:
    """
    Extract text using pdfminer.six with LAParams for layout preservation.
    Best for complex layouts — tables, columns, etc.
    """
    try:
        from pdfminer.high_level import extract_text_to_fp, extract_pages
        from pdfminer.layout import LAParams, LTTextContainer, LTChar
        from pdfminer.pdfpage import PDFPage

        # Layout analysis parameters
        laparams = LAParams(
            line_margin=0.5,
            word_margin=0.1,
            char_margin=2.0,
            boxes_flow=0.5,
            detect_vertical=True,
        )

        output = io.StringIO()

        if isinstance(pdf_input, bytes):
            fp = io.BytesIO(pdf_input)
        else:
            fp = open(pdf_input, 'rb')

        try:
            # Count pages first
            page_count = len(list(PDFPage.get_pages(fp)))
            fp.seek(0)

            # Extract with layout
            extract_text_to_fp(fp, output, laparams=laparams)
            full_text = output.getvalue()
        finally:
            if not isinstance(pdf_input, bytes):
                fp.close()

        if not full_text.strip():
            return None  # Empty — trigger next strategy

        return ExtractionResult(
            text=full_text,
            strategy="pdfminer",
            page_count=page_count,
            char_count=len(full_text),
            success=True,
            metadata={"library": "pdfminer.six", "layout_aware": True}
        )

    except ImportError:
        logger.warning("pdfminer.six not installed")
        return None
    except Exception as e:
        logger.warning(f"pdfminer extraction failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 4: OCR (Tesseract + PyMuPDF for page images)
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_with_ocr(pdf_input: Union[str, bytes]) -> Optional[ExtractionResult]:
    """
    Extract text using OCR (Tesseract) on rendered page images.
    Used when all text extraction strategies return empty (scanned PDFs).
    """
    try:
        import fitz  # PyMuPDF for rendering
        import pytesseract
        from PIL import Image

        if isinstance(pdf_input, bytes):
            doc = fitz.open(stream=pdf_input, filetype="pdf")
        else:
            doc = fitz.open(pdf_input)

        text_parts = []
        page_count = len(doc)
        warnings = []

        # Render at 300 DPI for good OCR quality
        zoom = 300 / 72  # 72 is default DPI
        matrix = fitz.Matrix(zoom, zoom)

        for page_num, page in enumerate(doc):
            try:
                # Render page to image
                pix = page.get_pixmap(matrix=matrix)

                # Convert to PIL Image
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))

                # OCR
                page_text = pytesseract.image_to_string(img, lang='eng')

                if page_text.strip():
                    text_parts.append(f"--- Page {page_num + 1} (OCR) ---\n{page_text}")
                else:
                    warnings.append(f"Page {page_num + 1}: OCR returned empty")

            except Exception as e:
                warnings.append(f"Page {page_num + 1}: OCR error - {str(e)}")
                logger.warning(f"OCR: Page {page_num + 1} error: {e}")

        doc.close()

        full_text = "\n\n".join(text_parts)

        if not full_text.strip():
            return None  # Empty — trigger next strategy

        return ExtractionResult(
            text=full_text,
            strategy="ocr",
            page_count=page_count,
            char_count=len(full_text),
            success=True,
            warnings=warnings,
            metadata={"library": "tesseract", "ocr": True, "dpi": 300}
        )

    except ImportError as e:
        logger.warning(f"OCR dependencies not installed: {e}")
        return None
    except Exception as e:
        logger.warning(f"OCR extraction failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 5: OCR with OpenCV preprocessing (enhanced)
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_with_ocr_enhanced(pdf_input: Union[str, bytes]) -> Optional[ExtractionResult]:
    """
    Extract text using OCR with OpenCV preprocessing for better results.
    Applies image enhancement before OCR — useful for low-quality scans.
    """
    try:
        import fitz
        import pytesseract
        import cv2
        import numpy as np
        from PIL import Image

        if isinstance(pdf_input, bytes):
            doc = fitz.open(stream=pdf_input, filetype="pdf")
        else:
            doc = fitz.open(pdf_input)

        text_parts = []
        page_count = len(doc)
        warnings = []

        zoom = 300 / 72
        matrix = fitz.Matrix(zoom, zoom)

        for page_num, page in enumerate(doc):
            try:
                # Render page
                pix = page.get_pixmap(matrix=matrix)
                img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                    pix.height, pix.width, pix.n
                )

                # Convert to grayscale
                if pix.n == 4:  # RGBA
                    gray = cv2.cvtColor(img_array, cv2.COLOR_RGBA2GRAY)
                elif pix.n == 3:  # RGB
                    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
                else:
                    gray = img_array

                # Apply preprocessing
                # 1. Denoise
                denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

                # 2. Adaptive thresholding for binarization
                binary = cv2.adaptiveThreshold(
                    denoised, 255,
                    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY,
                    11, 2
                )

                # 3. Deskew (if needed) — simplified version
                # Full deskew would require more complex processing

                # Convert to PIL for tesseract
                pil_img = Image.fromarray(binary)

                # OCR with custom config for better results
                custom_config = r'--oem 3 --psm 6'
                page_text = pytesseract.image_to_string(
                    pil_img, lang='eng', config=custom_config
                )

                if page_text.strip():
                    text_parts.append(f"--- Page {page_num + 1} (Enhanced OCR) ---\n{page_text}")
                else:
                    warnings.append(f"Page {page_num + 1}: Enhanced OCR returned empty")

            except Exception as e:
                warnings.append(f"Page {page_num + 1}: Enhanced OCR error - {str(e)}")
                logger.warning(f"Enhanced OCR: Page {page_num + 1} error: {e}")

        doc.close()

        full_text = "\n\n".join(text_parts)

        if not full_text.strip():
            return None  # Empty — trigger next strategy

        return ExtractionResult(
            text=full_text,
            strategy="ocr_enhanced",
            page_count=page_count,
            char_count=len(full_text),
            success=True,
            warnings=warnings,
            metadata={
                "library": "tesseract+opencv",
                "ocr": True,
                "preprocessing": ["denoise", "binarization"],
                "dpi": 300
            }
        )

    except ImportError as e:
        logger.warning(f"Enhanced OCR dependencies not installed: {e}")
        return None
    except Exception as e:
        logger.warning(f"Enhanced OCR extraction failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════════
# HELPER: Deskew
# ══════════════════════════════════════════════════════════════════════════════

def _deskew_image(gray_array):
    """
    Deskew a grayscale numpy array using OpenCV moments.
    Returns corrected numpy array.  Skips silently if cv2 not available.
    """
    try:
        import cv2
        import numpy as np

        coords = np.column_stack(np.where(gray_array < 128))
        if len(coords) < 50:
            return gray_array
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        if abs(angle) < 0.5:
            return gray_array
        (h, w) = gray_array.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            gray_array, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated
    except Exception:
        return gray_array


# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 6: OCR via pdf2image (fallback when PyMuPDF unavailable)
# ══════════════════════════════════════════════════════════════════════════════

def _extract_with_pdf2image_ocr(pdf_input: Union[str, bytes]) -> Optional[ExtractionResult]:
    """
    Convert PDF pages to images using poppler/pdf2image, then run Tesseract.
    Used as a fallback when PyMuPDF (fitz) is not available.
    """
    try:
        from pdf2image import convert_from_path, convert_from_bytes
        import pytesseract

        if isinstance(pdf_input, bytes):
            pages = convert_from_bytes(pdf_input, dpi=300)
        else:
            pages = convert_from_path(pdf_input, dpi=300)

        text_parts = []
        warnings_list = []

        for page_num, pil_img in enumerate(pages):
            try:
                page_text = pytesseract.image_to_string(
                    pil_img, lang='eng',
                    config='--oem 3 --psm 6',
                )
                if page_text.strip():
                    text_parts.append(f"--- Page {page_num + 1} (pdf2image OCR) ---\n{page_text}")
                else:
                    warnings_list.append(f"Page {page_num + 1}: pdf2image OCR returned empty")
            except Exception as e:
                warnings_list.append(f"Page {page_num + 1}: pdf2image OCR error - {str(e)}")

        full_text = "\n\n".join(text_parts)
        if not full_text.strip():
            return None

        return ExtractionResult(
            text=full_text,
            strategy="ocr_pdf2image",
            page_count=len(pages),
            char_count=len(full_text),
            success=True,
            warnings=warnings_list,
            metadata={"library": "pdf2image+tesseract", "ocr": True, "dpi": 300},
        )

    except ImportError as e:
        logger.warning(f"pdf2image OCR dependencies not installed: {e}")
        return None
    except Exception as e:
        logger.warning(f"pdf2image OCR extraction failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
# STANDALONE IMAGE OCR  (PNG / JPG / TIFF / BMP / WEBP)
# ══════════════════════════════════════════════════════════════════════════════

def extract_image_ocr(
    image_input: Union[str, bytes, "Path"],
    lang: str = "eng",
    langs: Optional[List[str]] = None,
    psm: int = 6,
    oem: int = 3,
    dpi: int = 300,
    preprocess: bool = True,
    multi_psm_fallback: bool = True,
) -> Dict[str, Any]:
    """
    Run Tesseract OCR on a single image file or raw bytes.

    Args:
        image_input : file path (str/Path) or raw image bytes
        lang        : Tesseract language code, e.g. 'eng', 'fra', 'deu'
        langs       : list of language codes (overrides `lang`)
        psm         : Tesseract page segmentation mode (default 6 = uniform block)
        oem         : Tesseract OCR engine mode  (default 3 = LSTM + legacy)
        dpi         : resolution hint passed to Tesseract
        preprocess  : apply OpenCV denoise + binarise + deskew before OCR
        multi_psm_fallback : if primary PSM returns <50 chars, retry with PSM 3/11/4

    Returns:
        Dict with: text, strategy, char_count, success, warnings, metadata
    """
    try:
        import pytesseract
        from PIL import Image as _PilImage

        # Load
        if isinstance(image_input, (str, Path)):
            img = _PilImage.open(str(image_input))
        else:
            img = _PilImage.open(io.BytesIO(image_input))

        if img.mode not in ("RGB", "L", "RGBA"):
            img = img.convert("RGB")

        warnings_list: List[str] = []
        original_size = img.size

        # Upscale narrow images
        if img.width < 1200:
            scale = 1200 / img.width
            new_size = (int(img.width * scale), int(img.height * scale))
            img = img.resize(new_size, _PilImage.LANCZOS)
            warnings_list.append(f"Upscaled {original_size} → {new_size} for OCR")

        # OpenCV preprocessing
        if preprocess:
            try:
                import cv2
                import numpy as np
                img_array = np.array(img.convert("RGB"))
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
                gray = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
                gray = _deskew_image(gray)
                binary = cv2.adaptiveThreshold(
                    gray, 255,
                    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY, 11, 2,
                )
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 1))
                binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
                img = _PilImage.fromarray(binary)
            except Exception as cv_err:
                warnings_list.append(f"OpenCV preprocessing skipped: {cv_err}")

        lang_str = "+".join(langs) if langs else lang
        tess_config = f"--oem {oem} --psm {psm} --dpi {dpi}"
        text = pytesseract.image_to_string(img, lang=lang_str, config=tess_config)

        # Multi-PSM fallback
        if multi_psm_fallback and len(text.strip()) < 50:
            for fallback_psm in (3, 11, 4, 1):
                if fallback_psm == psm:
                    continue
                try:
                    fb_text = pytesseract.image_to_string(
                        img, lang=lang_str,
                        config=f"--oem {oem} --psm {fallback_psm} --dpi {dpi}",
                    )
                    if len(fb_text.strip()) > len(text.strip()):
                        text = fb_text
                        warnings_list.append(f"Used fallback PSM {fallback_psm}")
                        psm = fallback_psm
                        break
                except Exception:
                    pass

        return {
            "text":       text,
            "strategy":   "tesseract_image_ocr",
            "char_count": len(text),
            "success":    bool(text.strip()),
            "warnings":   warnings_list,
            "metadata": {
                "library":        "pytesseract",
                "tesseract":      "5.x",
                "lang":           lang_str,
                "psm":            psm,
                "oem":            oem,
                "dpi":            dpi,
                "preprocessed":   preprocess,
                "original_size":  original_size,
            },
        }

    except ImportError as e:
        return {"text": "", "strategy": "tesseract_image_ocr", "char_count": 0,
                "success": False, "warnings": [f"OCR deps missing: {e}"], "metadata": {}}
    except Exception as e:
        logger.warning(f"Image OCR failed: {e}")
        return {"text": "", "strategy": "tesseract_image_ocr", "char_count": 0,
                "success": False, "warnings": [f"Image OCR error: {str(e)}"], "metadata": {}}


# MAIN EXTRACTION FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════

# Minimum character threshold to consider extraction successful
MIN_CHARS_THRESHOLD = 50


def extract_pdf_text(
    pdf_input: Union[str, bytes, Path],
    strategies: Optional[List[str]] = None,
    min_chars: int = MIN_CHARS_THRESHOLD,
    force_ocr: bool = False,
) -> Dict[str, Any]:
    """
    Extract text from a PDF using a cascade of strategies.

    Args:
        pdf_input: File path (str or Path) or PDF bytes
        strategies: List of strategies to try in order. Default: all
                   Options: 'pymupdf', 'pypdf2', 'pdfminer', 'ocr', 'ocr_enhanced'
        min_chars: Minimum characters to consider extraction successful
        force_ocr: Skip text extraction and go straight to OCR

    Returns:
        Dict with keys: text, strategy, page_count, char_count, success, warnings, metadata
    """

    # Convert Path to string
    if isinstance(pdf_input, Path):
        pdf_input = str(pdf_input)

    # Validate file exists if path
    if isinstance(pdf_input, str) and not os.path.exists(pdf_input):
        return ExtractionResult(
            text="",
            strategy="none",
            page_count=0,
            char_count=0,
            success=False,
            warnings=[f"File not found: {pdf_input}"],
        ).to_dict()

    # Default strategy order
    if strategies is None:
        if force_ocr:
            strategies = ['ocr', 'ocr_enhanced', 'ocr_pdf2image']
        else:
            strategies = ['pymupdf', 'pypdf2', 'pdfminer', 'ocr', 'ocr_enhanced', 'ocr_pdf2image']

    strategy_map = {
        'pymupdf': _extract_with_pymupdf,
        'pypdf2': _extract_with_pypdf2,
        'pdfminer': _extract_with_pdfminer,
        'ocr': _extract_with_ocr,
        'ocr_enhanced': _extract_with_ocr_enhanced,
    }

    all_warnings = []
    attempted_strategies = []

    for strategy_name in strategies:
        if strategy_name not in strategy_map:
            all_warnings.append(f"Unknown strategy: {strategy_name}")
            continue

        attempted_strategies.append(strategy_name)
        logger.info(f"Trying extraction strategy: {strategy_name}")

        try:
            result = strategy_map[strategy_name](pdf_input)

            if result and result.success and result.char_count >= min_chars:
                # Success — add any warnings from previous attempts
                result.warnings = all_warnings + result.warnings
                result.metadata["attempted_strategies"] = attempted_strategies
                logger.info(f"Extraction succeeded with {strategy_name}: {result.char_count} chars")
                return result.to_dict()
            elif result:
                # Got result but below threshold — log and continue
                all_warnings.append(
                    f"{strategy_name}: only {result.char_count} chars (below {min_chars} threshold)"
                )
        except Exception as e:
            all_warnings.append(f"{strategy_name}: exception - {str(e)}")
            logger.exception(f"Strategy {strategy_name} raised exception")

    # All strategies failed
    logger.warning(f"All extraction strategies failed for PDF")
    return ExtractionResult(
        text="",
        strategy="none",
        page_count=0,
        char_count=0,
        success=False,
        warnings=all_warnings,
        metadata={"attempted_strategies": attempted_strategies}
    ).to_dict()


def extract_pdf_text_from_bytes(pdf_bytes: bytes, **kwargs) -> Dict[str, Any]:
    """Convenience wrapper for bytes input."""
    return extract_pdf_text(pdf_bytes, **kwargs)


def extract_pdf_text_from_file(file_path: str, **kwargs) -> Dict[str, Any]:
    """Convenience wrapper for file path input."""
    return extract_pdf_text(file_path, **kwargs)


# ═══════════════════════════════════════════════════════════════════════════════
# CLI INTERFACE (for testing)
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python pdf_extractor.py <path_to_pdf> [--force-ocr]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    force_ocr = "--force-ocr" in sys.argv

    logging.basicConfig(level=logging.INFO)

    result = extract_pdf_text(pdf_path, force_ocr=force_ocr)

    # Print summary
    print(f"\n{'='*60}")
    print(f"Strategy: {result['strategy']}")
    print(f"Success: {result['success']}")
    print(f"Pages: {result['page_count']}")
    print(f"Characters: {result['char_count']}")
    if result['warnings']:
        print(f"Warnings: {result['warnings']}")
    print(f"{'='*60}")
    print(f"\nExtracted Text Preview (first 2000 chars):\n")
    print(result['text'][:2000])
