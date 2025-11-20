// RegulatoryLogosInlineComponents.jsx
// React components with actual SVG logos + hover effect
import fdaLogo from '../assets/logos/fda.svg';
import emaLogo from '../assets/logos/ema.svg';
import mhraLogo from '../assets/logos/mhra.svg';
import pmdaLogo from '../assets/logos/pmda.svg';
import nmpaLogo from '../assets/logos/nmpa.svg';
import healthCanadaLogo from '../assets/logos/healthcanada.svg';
import tgaLogo from '../assets/logos/tga.svg';
import mfdsLogo from '../assets/logos/mfds.svg';
import ceLogo from '../assets/logos/ce.svg';
import whoLogo from '../assets/logos/who.svg';
import hipaaLogo from '../assets/logos/hipaa.svg';
import gdprLogo from '../assets/logos/gdpr.svg';
import isoLogo from '../assets/logos/iso.svg';

// Partner logos
import ascoLogo from '../assets/logos/partners/asco.svg';
import nihLogo from '../assets/logos/partners/nih.svg';
import esmoLogo from '../assets/logos/partners/esmo.svg';
import cdcLogo from '../assets/logos/partners/cdc.svg';
import epaLogo from '../assets/logos/partners/epa.svg';
import hhsLogo from '../assets/logos/partners/hhs.svg';
import ichLogo from '../assets/logos/partners/ich.svg';

// Regulatory certification logos
import fda21cfrLogo from '../assets/logos/regulatory/fda_21cfr_part11.svg';
import fdaIchGcpLogo from '../assets/logos/regulatory/fda_ich_gcp.svg';
import fdaComplianceLogo from '../assets/logos/regulatory/fda_compliance_simplified.svg';
import fdaCertificationLogo from '../assets/logos/regulatory/fda_certification.svg';
import emaFullLogo from '../assets/logos/regulatory/ema_full.svg';

const base = 'inline-block transition-all duration-200 opacity-70 hover:opacity-100 m-0.5';
const logoStyle = 'h-6 w-auto filter grayscale hover:grayscale-0 transition-all';

export const FDA = () => (
  <div className={base} title="FDA (U.S.)">
    <img src={fdaLogo} alt="FDA" className={logoStyle} />
  </div>
);

export const EMA = () => (
  <div className={base} title="EMA (Europe)">
    <img src={emaLogo} alt="EMA" className={logoStyle} />
  </div>
);

export const MHRA = () => (
  <div className={base} title="MHRA (UK)">
    <img src={mhraLogo} alt="MHRA" className={logoStyle} />
  </div>
);

export const PMDA = () => (
  <div className={base} title="PMDA (Japan)">
    <img src={pmdaLogo} alt="PMDA" className={logoStyle} />
  </div>
);

export const NMPA = () => (
  <div className={base} title="NMPA (China)">
    <img src={nmpaLogo} alt="NMPA" className={logoStyle} />
  </div>
);

export const HealthCanada = () => (
  <div className={base} title="Health Canada">
    <img src={healthCanadaLogo} alt="Health Canada" className={logoStyle} />
  </div>
);

export const TGA = () => (
  <div className={base} title="TGA (Australia)">
    <img src={tgaLogo} alt="TGA" className={logoStyle} />
  </div>
);

export const MFDS = () => (
  <div className={base} title="MFDS (Korea)">
    <img src={mfdsLogo} alt="MFDS" className={logoStyle} />
  </div>
);

export const CE = () => (
  <div className={base} title="CE Mark (Europe)">
    <img src={ceLogo} alt="CE" className={logoStyle} />
  </div>
);

export const WHO = () => (
  <div className={base} title="WHO (World Health Organization)">
    <img src={whoLogo} alt="WHO" className={logoStyle} />
  </div>
);

export const HIPAA = () => (
  <div className={base} title="HIPAA Compliance (U.S.)">
    <img src={hipaaLogo} alt="HIPAA" className={logoStyle} />
  </div>
);

export const GDPR = () => (
  <div className={base} title="GDPR Compliance (EU)">
    <img src={gdprLogo} alt="GDPR" className={logoStyle} />
  </div>
);

export const ISO = () => (
  <div className={base} title="ISO 27001 Certification">
    <img src={isoLogo} alt="ISO" className={logoStyle} />
  </div>
);

// Partner Organization Components
export const ASCO = () => (
  <div className={base} title="American Society of Clinical Oncology">
    <img src={ascoLogo} alt="ASCO" className={logoStyle} />
  </div>
);

export const NIH = () => (
  <div className={base} title="National Institutes of Health">
    <img src={nihLogo} alt="NIH" className={logoStyle} />
  </div>
);

export const ESMO = () => (
  <div className={base} title="European Society for Medical Oncology">
    <img src={esmoLogo} alt="ESMO" className={logoStyle} />
  </div>
);

export const CDC = () => (
  <div className={base} title="Centers for Disease Control and Prevention">
    <img src={cdcLogo} alt="CDC" className={logoStyle} />
  </div>
);

export const EPA = () => (
  <div className={base} title="Environmental Protection Agency">
    <img src={epaLogo} alt="EPA" className={logoStyle} />
  </div>
);

export const HHS = () => (
  <div className={base} title="Department of Health and Human Services">
    <img src={hhsLogo} alt="HHS" className={logoStyle} />
  </div>
);

export const ICH = () => (
  <div className={base} title="International Council for Harmonisation">
    <img src={ichLogo} alt="ICH" className={logoStyle} />
  </div>
);

// Regulatory Certification Components
export const FDA21CFR = () => (
  <div className={base} title="FDA 21 CFR Part 11 Compliance">
    <img src={fda21cfrLogo} alt="FDA 21 CFR Part 11" className={logoStyle} />
  </div>
);

export const FDAICHGCP = () => (
  <div className={base} title="FDA ICH GCP E6(R2) Compliance">
    <img src={fdaIchGcpLogo} alt="FDA ICH GCP" className={logoStyle} />
  </div>
);

export const FDACompliance = () => (
  <div className={base} title="FDA Compliance Simplified">
    <img src={fdaComplianceLogo} alt="FDA Compliance" className={logoStyle} />
  </div>
);

export const FDACertification = () => (
  <div className={base} title="FDA & CE Certified">
    <img src={fdaCertificationLogo} alt="FDA Certification" className={logoStyle} />
  </div>
);

export const EMAFull = () => (
  <div className={base} title="European Medicines Agency">
    <img src={emaFullLogo} alt="EMA Full" className={logoStyle} />
  </div>
);
