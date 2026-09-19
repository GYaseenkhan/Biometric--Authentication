# Week 4 – Memorisation and Leakage Defence Research

## Purpose

This document provides a retrospective summary of the research and
planning for the AI/ML memorisation and leakage defence task.

The purpose of this stage was to understand how repeated information
in training data could potentially be memorised and later exposed
by a model.

## Risk Identified

Repeated information in a training corpus may increase the possibility
of a model reproducing the same information in its output.

For this project, only synthetic data is used. No real personal,
credential or sensitive information is used for security testing.

## Planned Testing Approach

The planned proof-of-concept was to:

1. Create a synthetic canary value.
2. Place the canary multiple times in the training corpus.
3. Train the model without deduplication.
4. Test whether the canary could be extracted.
5. Apply sentence-level deduplication.
6. Retrain the model using the deduplicated corpus.
7. Run the extraction test again.
8. Compare the vulnerable and hardened results.

## Proposed Defence

Sentence-level deduplication was selected for investigation.

The purpose of this control is to remove exact duplicate sentences
before model training and reduce unnecessary repetition in the
training corpus.

The defence should still allow genuine patterns appearing across
different sentences to be learned by the model.

## Data Requirements

The proof-of-concept uses synthetic data only.

The training record structure includes:

- user_id
- consent_id
- source_id
- text

These fields support the project's consent, source tracking and
deletion requirements.

## Week 4 Outcome

The memorisation and leakage risk, testing approach and proposed
deduplication control were identified.

This preparation provided the basis for the implementation and
testing carried out during Weeks 5–6.
