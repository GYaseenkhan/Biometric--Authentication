\# 03 - Data Flow



\## AI/ML Security PoC Pipeline



The AI/ML proof-of-concept trains on synthetic data only.



Pipeline:



Source Data

&#x20;   ↓

Consent Gate

&#x20;   ↓

Training Corpus

&#x20;   ↓

Deduplication and Anti-Poisoning Controls

&#x20;   ↓

Model Training

&#x20;   ↓

Text Generation

&#x20;   ↓

Extraction Resistance Testing

&#x20;   ↓

Deletion and Retraining Verification



\## Consent Enforcement



Every training record contains:



\- user\_id

\- consent\_id

\- source\_id



The consent gate blocks records without valid consent before they can enter training.



\## Data Deletion



Users can be removed from the corpus using the deletion workflow.

The model is retrained on the reduced dataset after deletion.



\## Memorisation and Leakage Defence



The PoC uses sentence-level deduplication to reduce memorisation risk.



A canary secret is intentionally planted in training data:



\- Vulnerable model: canary is extractable

\- Hardened model: canary is not extractable



\## Model Extraction Protection



The current PoC does not expose a public inference API.



If an inference API is added in future, model-theft and extraction risks should be mitigated through:



\- Request rate limiting

\- Query monitoring

\- Detection of repeated extraction-style prompts

\- Audit logging of suspicious activity

\- Security alerting for abnormal usage patterns

