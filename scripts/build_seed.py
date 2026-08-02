#!/usr/bin/env python3
"""
Builds data/methods.json — the seed database for Harmonization Zoo.
Run this once to regenerate the base file from scratch (before running
fetch_github_stats.py to enrich it with live star counts / last-commit dates).
"""
import json
import os

# Each record follows the schema documented in CONTRIBUTING.md
METHODS = [
    # ---------------- Table 1: ComBat-based / statistical methods ----------------
    dict(id="combat", name="ComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "batch-effect", "cortical-thickness"],
         paper_title="Harmonization of cortical thickness measurements across scanners and sites",
         github="Jfortin1/ComBatHarmonization", language=["R", "Python", "MATLAB"]),
    dict(id="neurocombat", name="neuroComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "batch-effect", "cortical-thickness"],
         paper_title="Harmonization of cortical thickness measurements across scanners and sites",
         github="Jfortin1/neuroCombat", language=["Python"]),
    dict(id="combat-gam", name="ComBat-GAM (neuroHarmonize)", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "lifespan", "GAM"],
         paper_title="Harmonization of large MRI datasets for the analysis of brain imaging patterns throughout the lifespan",
         github="rpomponio/neuroHarmonize", language=["Python"]),
    dict(id="harmonizer", name="harmonizer", category="combat-family", method_type="statistical",
         level="feature-level", tags=["benchmark", "multicenter", "machine-learning"],
         paper_title="Efficacy of MRI data harmonization in the age of machine learning: a multicenter study across 36 datasets",
         github="Imaging-AI-for-Health-virtual-lab/harmonizer", language=["Python"]),
    dict(id="covbat", name="CovBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "covariance", "batch-effect"],
         paper_title="Mitigating site effects in covariance for machine learning in neuroimaging data",
         github="andy1764/CovBat_Harmonization", language=["R", "Python"]),
    dict(id="prettyharmonize", name="PrettYharmonize", category="combat-family", method_type="statistical",
         level="feature-level", tags=["data-leakage", "class-imbalance", "pipeline"],
         paper_title="Impact of Leakage on Data Harmonization in Machine Learning Pipelines in Class Imbalance Across Sites",
         github="juaml/PrettYharmonize", language=["Python"]),
    dict(id="pycombat", name="pycombat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "batch-effect"],
         paper_title=None,
         github="CoAxLab/pycombat", language=["Python"]),
    dict(id="longcombat", name="LongComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "longitudinal"],
         paper_title="Longitudinal ComBat: A method for harmonizing longitudinal multi-scanner imaging data",
         github="jcbeer/longCombat", language=["R"]),
    dict(id="ravel", name="RAVEL", category="combat-family", method_type="statistical",
         level="image-level", tags=["intensity-normalization", "control-region"],
         paper_title="Removing inter-subject technical variability in magnetic resonance imaging studies",
         github="Jfortin1/RAVEL", language=["R"]),
    dict(id="relief", name="RELIEF", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "multivariate", "latent-effects"],
         paper_title="RELIEF: a structured multivariate approach for removal of latent inter-scanner effects",
         github="junjypark/RELIEF", language=["R"]),
    dict(id="combat-mega", name="ComBat-mega (ENIGMA)", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "mega-analysis", "ENIGMA"],
         paper_title="Increased power by harmonizing structural MRI site differences with the ComBat batch adjustment method in ENIGMA",
         github=None, other_url="https://enigma.ini.usc.edu/wp-content/uploads/combat_for_ENIGMA_sMRI/combat_for_ENIGMA_sMRI.R",
         language=["R"]),
    dict(id="combatls", name="ComBatLS", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "location-scale"],
         paper_title="ComBatLS: A location- and scale-preserving method for multi-site image harmonization",
         github="andy1764/ComBatFamily", language=["R"]),
    dict(id="opnestedcombat", name="OPNestedComBat", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "radiomics", "nested"],
         paper_title="Improved generalized ComBat methods for harmonization of radiomic features",
         github="hannah-horng/opnested-combat", language=["Python"]),
    dict(id="harmonizr", name="HarmonizR", category="combat-family", method_type="statistical",
         level="feature-level", tags=["empirical-bayes", "omics", "proteomics"],
         paper_title=None,
         github="SimonSchlumbohm/HarmonizR", language=["R"]),

    # ---------------- Table 2: Deep-learning-based methods ----------------
    dict(id="deepharmony", name="DeepHarmony", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["CNN", "contrast-harmonization"],
         paper_title="DeepHarmony: A deep learning approach to contrast harmonization across scanner changes",
         github=None, language=[]),
    dict(id="imunity", name="ImUnity", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["VAE", "GAN"],
         paper_title="ImUnity: A generalizable VAE-GAN solution for multicenter MR image harmonization",
         github=None, language=[]),
    dict(id="cyclegan-brainmri", name="CycleGAN (3D brain MRI)", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "cycle-consistency", "brain-age"],
         paper_title="Unsupervised harmonization of brain MRI using 3D CycleGANs and its effect on brain age prediction",
         github=None, language=[]),
    dict(id="mispel", name="MISPEL", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["autoencoder", "paired-data", "embedding"],
         paper_title="Multi-Scanner Harmonization of Paired Neuroimaging Data via Structure Preserving Embedding Learning",
         github="Mahbaneh/MISPEL", language=["Python"]),
    dict(id="harmless", name="Harmless", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "adversarial", "reproducibility"],
         paper_title="'Harmless' adversarial network harmonization approach for removing site effects and improving reproducibility in neuroimaging studies",
         github=None, language=[]),
    dict(id="xcov-disentanglement", name="Xcov disentanglement", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["disentanglement", "psychiatric", "representation-learning"],
         paper_title="Disentangled Neuroimaging Harmonization for Multi-Site Psychiatric Data Analysis",
         github="inesws/DRL_site_harmonization", language=["Python"]),
    dict(id="unlearning-mri", name="Unlearning for MRI Harmonisation", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["unlearning", "confound-removal", "domain-adaptation"],
         paper_title="Deep learning-based unlearning of dataset bias for MRI harmonisation and confound removal",
         github="nkdinsdale/Unlearning_for_MRI_harmonisation", language=["Python"]),
    dict(id="sfharmony", name="SFHarmony", category="deep-learning", method_type="deep-learning",
         level="feature-level", tags=["source-free", "domain-adaptation", "distributed"],
         paper_title="SFHarmony: Source Free Domain Adaptation for Distributed Neuroimaging Analysis",
         github="nkdinsdale/SFHarmony", language=["Python"]),
    dict(id="harmonized-fmri", name="Harmonized_fMRI", category="deep-learning", method_type="other",
         level="acquisition-level", tags=["fMRI", "protocol", "toolbox"],
         paper_title=None,
         github="HarmonizedMRI/Harmonized_fMRI", language=["MATLAB"]),
    dict(id="dmri-harmonization", name="dMRIharmonization", category="deep-learning", method_type="statistical",
         level="image-level", tags=["diffusion-MRI", "multi-shell", "retrospective"],
         paper_title="Retrospective harmonization of multi-site diffusion MRI data acquired with different acquisition parameters",
         github="pnlbwh/multi-shell-dMRIharmonization", language=["Python", "MATLAB", "Shell"]),
    dict(id="dictionary-learning-harmonization", name="Harmonization (adaptive dictionary learning)", category="deep-learning",
         method_type="statistical", level="image-level", tags=["diffusion-MRI", "dictionary-learning"],
         paper_title="Harmonization of diffusion MRI datasets with adaptive dictionary learning",
         github="samuelstjean/harmonization", language=["Python", "C", "Fortran"]),
    dict(id="b0shimming", name="B0shimming", category="deep-learning", method_type="other",
         level="acquisition-level", tags=["shimming", "toolbox", "acquisition"],
         paper_title="An open toolbox for harmonized B0 shimming",
         github="HarmonizedMRI/B0shimming", language=["MATLAB", "Julia"]),
    dict(id="intensity-normalization", name="Intensity Normalization", category="deep-learning", method_type="statistical",
         level="image-level", tags=["intensity-normalization", "image-synthesis"],
         paper_title="Evaluating the impact of intensity normalization on MR image synthesis",
         github="jcreinhold/intensity-normalization", language=["Python"]),
    dict(id="calamiti", name="CALAMITI", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "information-bottleneck", "unsupervised"],
         paper_title="Information-based Disentangled Representation Learning for Unsupervised MR Harmonization",
         github=None, other_url="https://iacl.ece.jhu.edu/index.php?title=CALAMITI", language=["Python"]),
    dict(id="murd", name="MURD", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["multi-site", "phantom-free"],
         paper_title="Learning multi-site harmonization of magnetic resonance images without traveling human phantoms",
         github=None, other_url="https://zenodo.org/records/8115979", language=["Python"]),
    dict(id="stgan", name="STGAN", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "style-transfer", "reference-image"],
         paper_title="Style transfer generative adversarial networks to harmonize multisite MRI to a single reference image to avoid overcorrection",
         github="USC-IGC/style_transfer_harmonization", language=["Python"]),
    dict(id="disarm", name="DISARM", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "image-to-image", "scanner-free"],
         paper_title="DISARM: Disentangled scanner-free image generation via unsupervised image2image translation",
         github="luca2245/DISARM_Harmonization", language=["Python"]),
    dict(id="disarmpp", name="DISARM++", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "image-to-image", "scanner-free"],
         paper_title="DISARM++: Beyond scanner-free harmonization",
         github="luca2245/DISARMpp_Harmonization", language=["Python"]),
    dict(id="iguane", name="IGUANe", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["GAN", "cycle-consistency", "generalizable"],
         paper_title="A 3D generalizable CycleGAN for multicenter harmonization of brain MR images",
         github="RocaVincent/iguane_harmonization", language=["Python"]),
    dict(id="haca3", name="HACA3", category="deep-learning", method_type="deep-learning",
         level="image-level", tags=["disentanglement", "unified-framework"],
         paper_title="HACA3: A unified approach for multi-site MR image harmonization",
         github="lianruizuo/haca3", language=["Python"]),

    # ---------------- Table 3: Alternative methods ----------------
    dict(id="bartharm", name="BARTharm", category="alternative", method_type="statistical",
         level="image-level", tags=["IQM", "bayesian-nonparametric"],
         paper_title="BARTharm: MRI Harmonization Using Image Quality Metrics and Bayesian Non-parametric",
         github="NeuroSML/BARTharm", language=["R"]),
    dict(id="neuroharmony", name="NeuroHarmony", category="alternative", method_type="machine-learning",
         level="feature-level", tags=["IQM", "unseen-scanners", "random-forest"],
         paper_title="Neuroharmony: A new tool for harmonizing volumetric MRI data from unseen scanners",
         github="garciadias/Neuroharmony", language=["Python"]),
    dict(id="bayesian-normative", name="Bayesian Normative Models", category="alternative", method_type="statistical",
         level="feature-level", tags=["normative-modeling", "hierarchical-bayesian"],
         paper_title="Accommodating site variation in neuroimaging data using normative and hierarchical Bayesian models",
         github="likeajumprope/Bayesian_normative_models", language=["Stan"]),
    dict(id="ismi", name="Inter-Site Matched Harmonization (ISMI)", category="alternative", method_type="statistical",
         level="feature-level", tags=["interpolation", "brain-age"],
         paper_title="Data harmonizing via interpolation applied to brain age prediction",
         github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
    dict(id="isi", name="Intra-Site Interpolation (ISI)", category="alternative", method_type="statistical",
         level="feature-level", tags=["interpolation"],
         paper_title=None,
         github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
    dict(id="fedharmony", name="FedHarmony", category="alternative", method_type="deep-learning",
         level="feature-level", tags=["federated-learning", "unlearning", "distributed"],
         paper_title="FedHarmony: Unlearning Scanner Bias with Distributed Data",
         github="nkdinsdale/FedHarmony", language=["Python"]),
    dict(id="fedcombat", name="Fed-ComBat", category="alternative", method_type="statistical",
         level="feature-level", tags=["federated-learning", "empirical-bayes", "distributed"],
         paper_title="Fed-ComBat: A Generalized Federated Framework for Batch Effect Harmonization in Collaborative Studies",
         github="greguig/fedcombat", language=["Python"]),
    dict(id="d-combat", name="d-ComBat", category="alternative", method_type="statistical",
         level="feature-level", tags=["federated-learning", "privacy-preserving", "distributed"],
         paper_title="Privacy-preserving harmonization via distributed ComBat",
         github="andy1764/Distributed-ComBat", language=["R", "Python"]),
    dict(id="ica-dp", name="ICA-DP", category="alternative", method_type="statistical",
         level="image-level", tags=["ICA", "blind-source-separation", "dual-projection"],
         paper_title="Repeatability analysis of ICA-based harmonization for multi-site MRI data using dual projection models",
         github="Yuxing-Hao/ICA-DP_Harmonization", language=["MATLAB"]),
    dict(id="otda", name="OTDA", category="alternative", method_type="machine-learning",
         level="feature-level", tags=["optimal-transport", "domain-adaptation"],
         paper_title="Optimal Transport for Domain Adaptation",
         github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
    dict(id="botda", name="BOTDA", category="alternative", method_type="machine-learning",
         level="feature-level", tags=["optimal-transport", "domain-adaptation", "EEG"],
         paper_title="Transfer learning based on optimal transport for motor imagery brain-computer interfaces",
         github=None, other_url="https://github.com/N-Nieto/UniHarmony", language=["Python"]),
]

CATEGORY_LABELS = {
    "combat-family": "ComBat-based",
    "deep-learning": "Deep learning-based",
    "alternative": "Alternative",
}


def main():
    out = []
    for m in METHODS:
        rec = dict(m)
        rec.setdefault("github", None)
        rec.setdefault("other_url", None)
        rec.setdefault("paper_title", None)
        rec["paper_year"] = None          # fill in manually or via a literature-search script
        rec["abstract"] = None            # short, ORIGINAL paraphrase only — never paste the real abstract verbatim
        rec["citations"] = None           # optional: fill via Semantic Scholar / Google Scholar
        rec["stars"] = None               # filled by fetch_github_stats.py
        rec["last_commit"] = None         # filled by fetch_github_stats.py
        rec["repo_description"] = None    # filled by fetch_github_stats.py
        rec["category_label"] = CATEGORY_LABELS[rec["category"]]
        out.append(rec)

    os.makedirs("data", exist_ok=True)
    with open("data/methods.json", "w") as f:
        json.dump({"generated_by": "build_seed.py", "methods": out}, f, indent=2)
    print(f"Wrote {len(out)} methods to data/methods.json")


if __name__ == "__main__":
    main()
