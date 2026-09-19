# 03 - Data Flow

## AI/ML Security PoC Pipeline

The AI/ML proof-of-concept trains on synthetic data only.

Pipeline:

Source Data
    ↓
Consent Gate
    ↓
Per-User Contribution Cap
    ↓
Training Corpus
    ↓
Model Training
    ↓
Sentence Deduplication
    ↓
Text Generation
    ↓
Extraction Resistance Testing
    ↓
Deletion and Retraining Verification

## Consent Enforcement

Every training record contains:

- user_id
- consent_id
- source_id

The consent gate blocks records without a consent record before they can enter training.

## Data Deletion

Users can be removed from the corpus using the deletion workflow.

The model is retrained on the reduced dataset after deletion.

## Memorisation and Leakage Defence

The PoC uses sentence-level deduplication to reduce memorisation risk.

A canary secret is intentionally planted in training data:

- Vulnerable model: canary is extractable
- Hardened model: canary is not extractable

## Model Extraction Protection

The AI/ML PoC itself is a local Python script and does not expose a dedicated inference API.

The wider application already applies requestRateLimit(...) and audit logging to AI-related endpoints, including behavioural-model and content-profile routes.

If a dedicated inference API is introduced in the future, the same rate-limiting and audit-monitoring patterns should be reused to reduce model-extraction risk.