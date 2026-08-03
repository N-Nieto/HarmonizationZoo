#!/usr/bin/env python3
"""
Builds data/methods.json — the seed database for Harmonization Zoo.
Run this once to regenerate the base file from scratch (before running
fetch_github_stats.py to enrich it with live star counts / first-commit
year / last-commit date / etc).

`paper_year` and `paper_url` were verified against the actual published
paper (journal/arXiv/bioRxiv/DOI listing), not guessed — see
CONTRIBUTING.md. Where a method has no associated paper, or a detail
couldn't be confidently verified, it's left as `None` rather than
estimated. As of this revision, the *displayed* timeline year in the app
comes from the repo's first commit (see fetch_github_stats.py) rather than
paper_year, since that's automatable and verifiable for every method with
code — paper_year is kept as separate, independently useful metadata.
"""
import json
import os

METHODS = [
    # ---------------- ComBat-based ----------------
    dict(id="combat", name="ComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "batch-effect", "cortical-thickness"],
         paper_title="Harmonization of cortical thickness measurements across scanners and sites",
         paper_year=2018, paper_url="https://doi.org/10.1016/j.neuroimage.2017.11.024",
         github="Jfortin1/ComBatHarmonization", language=["R", "Python", "MATLAB"]),
    dict(id="neurocombat", name="neuroComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "batch-effect", "cortical-thickness"],
         paper_title="Harmonization of cortical thickness measurements across scanners and sites",
         paper_year=2018, paper_url="https://doi.org/10.1016/j.neuroimage.2017.11.024",
         github="Jfortin1/neuroCombat", language=["Python"]),
    dict(id="combat-gam", name="ComBat-GAM (neuroHarmonize)", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "lifespan", "GAM"],
         paper_title="Harmonization of large MRI datasets for the analysis of brain imaging patterns throughout the lifespan",
         paper_year=2020, paper_url="https://doi.org/10.1016/j.neuroimage.2019.116450",
         github="rpomponio/neuroHarmonize", language=["Python"]),
    dict(id="harmonizer", name="harmonizer", category="combat-family", method_type="statistical",
         level="feature-level", tags=["benchmark", "multicenter", "machine-learning"],
         paper_title="Efficacy of MRI data harmonization in the age of machine learning: a multicenter study across 36 datasets",
         paper_year=None, paper_url=None, github="Imaging-AI-for-Health-virtual-lab/harmonizer", language=["Python"]),
    dict(id="covbat", name="CovBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "covariance", "batch-effect"],
         paper_title="Mitigating site effects in covariance for machine learning in neuroimaging data",
         paper_year=2021, paper_url="https://doi.org/10.1002/hbm.25688",
         github="andy1764/CovBat_Harmonization", language=["R", "Python"]),
    dict(id="prettyharmonize", name="PrettYharmonize", category="combat-family", method_type="statistical",
         level="feature-level", tags=["data-leakage", "class-imbalance", "pipeline"],
         paper_title="Impact of Leakage on Data Harmonization in Machine Learning Pipelines in Class Imbalance Across Sites",
         paper_year=2026, paper_url="https://www.sciencedirect.com/science/article/pii/S0925231226005436",
         github="juaml/PrettYharmonize", language=["Python"]),
    dict(id="pycombat", name="pycombat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "batch-effect"],
         paper_title=None, paper_year=None, paper_url=None,
         github="CoAxLab/pycombat", language=["Python"]),
    dict(id="longcombat", name="LongComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "longitudinal"],
         paper_title="Longitudinal ComBat: A method for harmonizing longitudinal multi-scanner imaging data",
         paper_year=2020, paper_url="https://doi.org/10.1016/j.neuroimage.2020.117129",
         github="jcbeer/longCombat", language=["R"]),
    dict(id="ravel", name="RAVEL", category="combat-family", method_type="statistical",
         level="image-level", tags=["intensity-normalization", "control-region"],
         paper_title="Removing inter-subject technical variability in magnetic resonance imaging studies",
         paper_year=2016, paper_url="https://doi.org/10.1016/j.neuroimage.2016.02.036",
         github="Jfortin1/RAVEL", language=["R"]),
    dict(id="relief", name="RELIEF", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "multivariate", "latent-effects"],
         paper_title="RELIEF: a structured multivariate approach for removal of latent inter-scanner effects",
         paper_year=2023, paper_url="https://doi.org/10.1162/imag_a_00011", github="junjypark/RELIEF", language=["R"]),
    dict(id="combat-mega", name="ComBat-mega (ENIGMA)", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "mega-analysis", "ENIGMA"],
         paper_title="Increased power by harmonizing structural MRI site differences with the ComBat batch adjustment method in ENIGMA",
         paper_year=2020, paper_url="https://doi.org/10.1016/j.neuroimage.2020.116956", github=None,
         other_url="https://enigma.ini.usc.edu/wp-content/uploads/combat_for_ENIGMA_sMRI/combat_for_ENIGMA_sMRI.R",
         language=["R"]),
    dict(id="combatls", name="ComBatLS", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "location-scale"],
         paper_title="ComBatLS: A location- and scale-preserving method for multi-site image harmonization",
         paper_year=2024, paper_url=None, github="andy1764/ComBatFamily", language=["R"]),
    dict(id="opnestedcombat", name="OPNestedComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "radiomics", "nested"],
         paper_title="Improved generalized ComBat methods for harmonization of radiomic features",
         paper_year=2022, paper_url=None, github="hannah-horng/opnested-combat", language=["Python"]),
    dict(id="harmonizr", name="HarmonizR", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "omics", "proteomics"],
         paper_title=None, paper_year=None, paper_url=None,
         github="SimonSchlumbohm/HarmonizR", language=["R"]),

    # ---------------- Classical intensity normalization (pre-dates "harmonization" framing, still used as baselines) ----------------
    dict(id="whitestripe", name="WhiteStripe", category="classical-normalization", method_type="statistical",
         level="image-level", tags=["intensity-normalization", "white-matter", "reference-region"],
         paper_title="Statistical normalization techniques for magnetic resonance imaging",
         paper_year=2014, paper_url="https://doi.org/10.1016/j.nicl.2014.08.008",
         github="muschellij2/WhiteStripe", language=["R"]),
    dict(id="nyul", name="Nyúl–Udupa Histogram Matching", category="classical-normalization", method_type="statistical",
         level="image-level", tags=["intensity-normalization", "histogram-matching"],
         paper_title="On standardizing the MR image intensity scale",
         paper_year=1999, paper_url="https://doi.org/10.1002/(SICI)1522-2594(199912)42:6<1072::AID-MRM11>3.0.CO;2-M",
         github=None, other_url="https://github.com/jcreinhold/intensity-normalization", language=["Python"]),

    # ---------------- Deep-learning-based ----------------
    dict(id="deepharmony", name="DeepHarmony", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["CNN", "contrast-harmonization"],
         paper_title="DeepHarmony: A deep learning approach to contrast harmonization across scanner changes",
         paper_year=2019, paper_url="https://doi.org/10.1016/j.mri.2019.05.041", github=None, language=[]),
    dict(id="imunity", name="ImUnity", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["VAE", "GAN"],
         paper_title="ImUnity: A generalizable VAE-GAN solution for multicenter MR image harmonization",
         paper_year=2023, paper_url="https://doi.org/10.1016/j.media.2023.102799", github=None, language=[]),
    dict(id="cyclegan-brainmri", name="CycleGAN (3D brain MRI, Komandur et al.)", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "cycle-consistency", "brain-age"],
         paper_title="Unsupervised harmonization of brain MRI using 3D CycleGANs and its effect on brain age prediction",
         paper_year=2023, paper_url="https://doi.org/10.1109/SIPAIM56729.2023.10373501", github=None, language=[]),
    dict(id="mispel", name="MISPEL", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["autoencoder", "paired-data", "embedding"],
         paper_title="Multi-Scanner Harmonization of Paired Neuroimaging Data via Structure Preserving Embedding Learning",
         paper_year=2023, paper_url=None, github="Mahbaneh/MISPEL", language=["Python"]),
    dict(id="harmless", name="Harmless (MCD-GAN)", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["GAN", "adversarial", "reproducibility"],
         paper_title="'Harmless' adversarial network harmonization approach for removing site effects and improving reproducibility in neuroimaging studies",
         paper_year=2022, paper_url="https://doi.org/10.1109/EMBC48229.2022.9871061", github=None, language=[]),
    dict(id="xcov-disentanglement", name="Xcov disentanglement", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["disentanglement", "psychiatric", "representation-learning"],
         paper_title="Disentangled Neuroimaging Harmonization for Multi-Site Psychiatric Data Analysis",
         paper_year=None, paper_url=None, github="inesws/DRL_site_harmonization", language=["Python"]),
    dict(id="unlearning-mri", name="Unlearning for MRI Harmonisation", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["unlearning", "confound-removal", "domain-adaptation"],
         paper_title="Deep learning-based unlearning of dataset bias for MRI harmonisation and confound removal",
         paper_year=2021, paper_url=None, github="nkdinsdale/Unlearning_for_MRI_harmonisation", language=["Python"]),
    dict(id="sfharmony", name="SFHarmony", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["source-free", "domain-adaptation", "distributed"],
         paper_title="SFHarmony: Source Free Domain Adaptation for Distributed Neuroimaging Analysis",
         paper_year=None, paper_url=None, github="nkdinsdale/SFHarmony", language=["Python"]),
    dict(id="harmonized-fmri", name="Harmonized_fMRI", category="deep-learning", method_type="other",
         level="acquisition-level", tags=["fMRI", "protocol", "toolbox"],
         paper_title=None, paper_year=None, paper_url=None,
         github="HarmonizedMRI/Harmonized_fMRI", language=["MATLAB"]),
    dict(id="dmri-harmonization", name="dMRIharmonization", category="deep-learning", method_type="statistical",
         level="image-level", tags=["diffusion-MRI", "multi-shell", "retrospective"],
         paper_title="Retrospective harmonization of multi-site diffusion MRI data acquired with different acquisition parameters",
         paper_year=None, paper_url=None, github="pnlbwh/multi-shell-dMRIharmonization", language=["Python", "MATLAB", "Shell"]),
    dict(id="dictionary-learning-harmonization", name="Harmonization (adaptive dictionary learning)", category="deep-learning",
         method_type="statistical", level="image-level", tags=["diffusion-MRI", "dictionary-learning"],
         paper_title="Harmonization of diffusion MRI datasets with adaptive dictionary learning",
         paper_year=None, paper_url=None, github="samuelstjean/harmonization", language=["Python", "C", "Fortran"]),
    dict(id="b0shimming", name="B0shimming", category="deep-learning", method_type="other",
         level="acquisition-level", tags=["shimming", "toolbox", "acquisition"],
         paper_title="An open toolbox for harmonized B0 shimming",
         paper_year=None, paper_url=None, github="HarmonizedMRI/B0shimming", language=["MATLAB", "Julia"]),
    dict(id="intensity-normalization", name="Intensity Normalization (toolbox)", category="deep-learning", method_type="statistical",
         level="image-level", tags=["intensity-normalization", "image-synthesis", "toolbox"],
         paper_title="Evaluating the impact of intensity normalization on MR image synthesis",
         paper_year=None, paper_url=None, github="jcreinhold/intensity-normalization", language=["Python"]),
    dict(id="calamiti", name="CALAMITI", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "information-bottleneck", "unsupervised"],
         paper_title="Unsupervised MR harmonization by learning disentangled representations using information bottleneck theory",
         paper_year=2021, paper_url="https://doi.org/10.1016/j.neuroimage.2021.118569",
         github=None, other_url="https://iacl.ece.jhu.edu/index.php?title=CALAMITI", language=["Python"]),
    dict(id="dewey-disentangled-latent", name="Disentangled Latent Space (Dewey et al.)", category="deep-learning",
         method_type="deep-learning", level="image-level", tags=["disentanglement", "CALAMITI-precursor"],
         paper_title="A Disentangled Latent Space for Cross-Site MRI Harmonization",
         paper_year=2020, paper_url="https://doi.org/10.1007/978-3-030-59728-3_70", github=None, language=[]),
    dict(id="murd", name="MURD", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["multi-site", "phantom-free"],
         paper_title="Learning multi-site harmonization of magnetic resonance images without traveling human phantoms",
         paper_year=None, paper_url=None, github=None, other_url="https://zenodo.org/records/8115979", language=["Python"]),
    dict(id="stgan", name="STGAN", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "style-transfer", "reference-image"],
         paper_title="Style transfer generative adversarial networks to harmonize multisite MRI to a single reference image to avoid overcorrection",
         paper_year=2023, paper_url="https://doi.org/10.1002/hbm.26422",
         github="USC-IGC/style_transfer_harmonization", language=["Python"]),
    dict(id="disarm", name="DISARM", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "image-to-image", "scanner-free"],
         paper_title="DISARM: Disentangled scanner-free image generation via unsupervised image2image translation",
         paper_year=2024, paper_url=None, github="luca2245/DISARM_Harmonization", language=["Python"]),
    dict(id="disarmpp", name="DISARM++", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "image-to-image", "scanner-free"],
         paper_title="DISARM++: Beyond scanner-free harmonization",
         paper_year=2025, paper_url=None, github="luca2245/DISARMpp_Harmonization", language=["Python"]),
    dict(id="iguane", name="IGUANe", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "cycle-consistency", "generalizable"],
         paper_title="A 3D generalizable CycleGAN for multicenter harmonization of brain MR images",
         paper_year=2024, paper_url="https://arxiv.org/abs/2402.03227", github="RocaVincent/iguane_harmonization", language=["Python"]),
    dict(id="haca3", name="HACA3", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "unified-framework"],
         paper_title="HACA3: A unified approach for multi-site MR image harmonization",
         paper_year=2023, paper_url="https://doi.org/10.1016/j.compmedimag.2023.102285", github="lianruizuo/haca3", language=["Python"]),
    dict(id="scanner-invariant-repr", name="Scanner Invariant Representations (Moyer et al.)", category="deep-learning",
         method_type="deep-learning", level="feature-level", tags=["diffusion-MRI", "adversarial", "invariant-representation"],
         paper_title="Scanner invariant representations for diffusion MRI harmonization",
         paper_year=2020, paper_url="https://doi.org/10.1002/mrm.28243", github=None, language=[]),
    dict(id="flow-causal-harmonization", name="Harmonization with Flow-Based Causal Inference (Wang et al.)", category="deep-learning",
         method_type="deep-learning", level="feature-level", tags=["normalizing-flows", "causal-inference"],
         paper_title="Harmonization with Flow-Based Causal Inference",
         paper_year=2021, paper_url="https://doi.org/10.1007/978-3-030-87199-4_17", github=None, language=[]),
    dict(id="bashyam-stargan-harmonization", name="Deep Generative (StarGAN-based) Harmonization (Bashyam et al.)", category="deep-learning",
         method_type="deep-learning", level="image-level", tags=["GAN", "StarGAN", "cross-site-generalization"],
         paper_title="Deep Generative Medical Image Harmonization for Improving Cross-Site Generalization in Deep Learning Predictors",
         paper_year=2021, paper_url="https://doi.org/10.1002/jmri.27908", github=None, language=[]),
    dict(id="modanwal-cyclegan", name="Cycle-Consistent GAN Harmonization (Modanwal et al.)", category="deep-learning",
         method_type="deep-learning", level="image-level", tags=["GAN", "cycle-consistency"],
         paper_title="MRI image harmonization using cycle-consistent generative adversarial network",
         paper_year=2020, paper_url="https://doi.org/10.1117/12.2551301", github=None, language=[]),
    dict(id="dlest", name="DLEST (Disentangled Latent Energy-Based Style Translation)", category="deep-learning",
         method_type="deep-learning", level="image-level", tags=["disentanglement", "energy-based-model", "style-translation"],
         paper_title="Disentangled Latent Energy-Based Style Translation: An Image-Level Structural MRI Harmonization Framework",
         paper_year=2025, paper_url="https://arxiv.org/abs/2402.06875", github=None, language=[]),

    # ---------------- IQM-based ----------------
    dict(id="bartharm", name="BARTharm", category="iqm-based", method_type="statistical",
         level="feature-level", tags=["IQM", "bayesian-nonparametric"],
         paper_title="BARTharm: MRI Harmonization Using Image Quality Metrics and Bayesian Non-parametric",
         paper_year=2025, paper_url=None, github="NeuroSML/BARTharm", language=["R"]),
    dict(id="neuroharmony", name="NeuroHarmony", category="iqm-based", method_type="machine-learning",
         level="feature-level", tags=["IQM", "unseen-scanners", "random-forest"],
         paper_title="Neuroharmony: A new tool for harmonizing volumetric MRI data from unseen scanners",
         paper_year=2020, paper_url=None, github="garciadias/Neuroharmony", language=["Python"]),
    dict(id="autocombat", name="AutoComBat (ComScan)", category="iqm-based", method_type="statistical",
         level="feature-level", tags=["IQM", "empirical-bayes", "radiomics", "auto-batch"],
         paper_title="AutoComBat: a generic method for harmonizing MRI-based radiomic features",
         paper_year=2022, paper_url=None, github="Alxaline/ComScan", language=["Python"]),

    # ---------------- Normative Modeling ----------------
    dict(id="bayesian-normative", name="Bayesian Normative Models", category="normative-modeling", method_type="statistical",
         level="feature-level", tags=["normative-modeling", "hierarchical-bayesian"],
         paper_title="Accommodating site variation in neuroimaging data using normative and hierarchical Bayesian models",
         paper_year=2022, paper_url=None, github="likeajumprope/Bayesian_normative_models", language=["Stan"]),

    # ---------------- Interpolation-based ----------------
    dict(id="ismi", name="Inter-Site SMOTE (ISMI)", category="interpolation-based", method_type="statistical",
         level="feature-level", tags=["interpolation", "brain-age", "SMOTE"],
         paper_title="Data harmonizing via interpolation applied to brain age prediction",
         paper_year=2026, paper_url="https://doi.org/10.1007/s44248-026-00100-7",
         github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
    dict(id="isi", name="Intra-Site Interpolation (ISI)", category="interpolation-based", method_type="statistical",
         level="feature-level", tags=["interpolation"],
         paper_title=None, paper_year=None, paper_url=None,
         github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),

    # ---------------- Federated Learning-compatible ----------------
    dict(id="fedharmony", name="FedHarmony", category="federated", method_type="deep-learning",
         level="feature-level", tags=["federated-learning", "unlearning", "distributed"],
         paper_title="FedHarmony: Unlearning Scanner Bias with Distributed Data",
         paper_year=2022, paper_url=None, github="nkdinsdale/FedHarmony", language=["Python"]),
    dict(id="fedcombat", name="Fed-ComBat", category="federated", method_type="statistical",
         level="feature-level", tags=["federated-learning", "empirical-bayes", "distributed"],
         paper_title="Fed-ComBat: A Generalized Federated Framework for Batch Effect Harmonization in Collaborative Studies",
         paper_year=None, paper_url=None, github="greguig/fedcombat", language=["Python"]),
    dict(id="d-combat", name="d-ComBat", category="federated", method_type="statistical",
         level="feature-level", tags=["federated-learning", "privacy-preserving", "distributed"],
         paper_title="Privacy-preserving harmonization via distributed ComBat",
         paper_year=None, paper_url=None, github="andy1764/Distributed-ComBat", language=["R", "Python"]),

    # ---------------- ICA-based ----------------
    dict(id="ica-dp", name="ICA-DP", category="ica-based", method_type="statistical",
         level="image-level", tags=["ICA", "blind-source-separation", "dual-projection"],
         paper_title="Repeatability analysis of ICA-based harmonization for multi-site MRI data using dual projection models",
         paper_year=None, paper_url=None, github="Yuxing-Hao/ICA-DP_Harmonization", language=["MATLAB"]),

    # ---------------- Optimal transport-based ----------------
    dict(id="otda", name="OTDA", category="optimal-transport", method_type="machine-learning",
         level="feature-level", tags=["optimal-transport", "domain-adaptation"],
         paper_title="Optimal Transport for Domain Adaptation",
         paper_year=None, paper_url=None, github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
    dict(id="botda", name="BOTDA", category="optimal-transport", method_type="machine-learning",
         level="feature-level", tags=["optimal-transport", "domain-adaptation", "EEG"],
         paper_title="Transfer learning based on optimal transport for motor imagery brain-computer interfaces",
         paper_year=None, paper_url=None, github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
]

CATEGORY_LABELS = {
    "combat-family": "Location/Scale Models (ComBat-family)",
    "classical-normalization": "Classical Intensity Normalization",
    "deep-learning": "Deep learning-based",
    "iqm-based": "IQM-based",
    "normative-modeling": "Normative Modeling",
    "interpolation-based": "Interpolation-based",
    "federated": "Federated Learning-compatible",
    "ica-based": "ICA-based",
    "optimal-transport": "Optimal transport-based",
}

# Confirmed by the UniHarmony/PrettYharmonize/Inter-Site-SMOTE author directly
# (not independently re-verified via API — treated as a primary source here).
IN_UNIHARMONY = {
    "combat", "neurocombat", "combat-gam", "harmonizer", "covbat",
    "prettyharmonize", "pycombat", "ismi", "isi", "otda", "botda",
}

# Other toolkits/packages that also bundle a given method, beyond its own repo.
ALSO_IMPLEMENTED_IN = {
    "neurocombat": ["neuroHarmonize"],
    "covbat": ["neuroHarmonize"],
}

# Primary validation cohort/dataset, where the paper is clearly anchored to
# one (or a named, bounded set) rather than "whatever was on hand". Default
# is "Agnostic" — either genuinely dataset-agnostic, evaluated across many
# heterogeneous datasets with no single primary one, or just not yet
# researched. Never guessed; only set from a verified source.
VALIDATION_DATA = {
    "combat": "EMBARC, VDLC (multi-site depression studies)",
    "neurocombat": "EMBARC, VDLC (multi-site depression studies)",
    "combat-gam": "iSTAGING consortium (UK Biobank, ADNI, BLSA, and others)",
    "combat-mega": "ENIGMA consortium",
    "relief": "SPINS (schizophrenia, diffusion MRI)",
    "haca3": "21-site multi-institutional MRI (multiple contrasts)",
    "stgan": "UK Biobank, PPMI, ADNI, ABCD, ICBM",
    "cyclegan-brainmri": "ADNI, WHIMS, OASIS, AIBL, UK Biobank",
    "harmless": "ABCD",
    "ismi": "4 neuroimaging datasets, brain-age (N=2031)",
    "whitestripe": "AIBL, ADNI",
}


def main():
    out = []
    for m in METHODS:
        rec = dict(m)
        rec.setdefault("github", None)
        rec.setdefault("other_url", None)
        rec.setdefault("paper_title", None)
        rec.setdefault("paper_year", None)
        rec.setdefault("paper_url", None)
        rec["abstract"] = None            # short, ORIGINAL paraphrase only — never paste the real abstract verbatim
        rec["citations"] = None           # optional: fill via Semantic Scholar / Google Scholar
        # GitHub-derived fields — all filled by fetch_github_stats.py, never by hand:
        rec["stars"] = None
        rec["forks"] = None
        rec["open_issues"] = None
        rec["license"] = None
        rec["topics"] = None
        rec["archived"] = None
        rec["repo_created_at"] = None     # when the repo itself was created
        rec["first_commit_date"] = None   # date of the repo's first commit — drives the Year view
        rec["last_commit"] = None
        rec["repo_description"] = None
        rec["category_label"] = CATEGORY_LABELS[rec["category"]]
        rec["in_uniharmony"] = rec["id"] in IN_UNIHARMONY
        rec["also_implemented_in"] = ALSO_IMPLEMENTED_IN.get(rec["id"], [])
        rec["validation_data"] = VALIDATION_DATA.get(rec["id"], "Agnostic")
        out.append(rec)

    os.makedirs("data", exist_ok=True)
    with open("data/methods.json", "w") as f:
        json.dump({"generated_by": "build_seed.py", "methods": out}, f, indent=2)
    print(f"Wrote {len(out)} methods to data/methods.json")
    have_year = sum(1 for m in out if m["paper_year"])
    have_url = sum(1 for m in out if m["paper_url"])
    have_repo = sum(1 for m in out if m["github"])
    have_data = sum(1 for m in out if m["validation_data"] != "Agnostic")
    in_uh = sum(1 for m in out if m["in_uniharmony"])
    print(f"{have_year}/{len(out)} have a verified publication year")
    print(f"{have_url}/{len(out)} have a verified paper link")
    print(f"{have_repo}/{len(out)} have a GitHub repo (eligible for auto-fetched stats)")
    print(f"{have_data}/{len(out)} have a specific (non-Agnostic) validation dataset")
    print(f"{in_uh}/{len(out)} flagged as implemented in UniHarmony")


if __name__ == "__main__":
    main()
