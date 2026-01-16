# eCTD Packager Integration

🔧 **What I implemented**

- The server packager now invokes the metadata-driven Python eCTD generator (`scripts/create_ectd_xml.py`) when a sequence package is requested via the `/api/reg/sequences/:id/package` endpoint.

💡 **How it works**

- The server looks up the submission's `product_id` and reads/overrides the study metadata (sets `seq` to the sequence number) and writes a temp metadata YAML.
- It runs `python3 scripts/create_ectd_xml.py --study <product_id> --meta <tmp-meta.yml>` which copies files as specified in the metadata and generates `submission.xml` and `sequence.xml` and zips the sequence into `regulatory/CER/<study>/ectd_xml/seqNNNN.zip`.
- After creation, the server computes the package SHA256 and updates the database record for the sequence.

✅ **Notes & testing**

- I verified the generator by running `python3 scripts/create_ectd_xml.py --study SAMPLE_STUDY` and confirming the zip appears at `regulatory/CER/SAMPLE_STUDY/ectd_xml/seq0001.zip`.
- The Python generator requires `pyyaml`.

Next steps: add unit/integration tests for the packaging flow and verify the browser UI (`EctdPackager`) calls and handles package creation & download successfully.