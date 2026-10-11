"""
Runs the team's AI/ML security proof-of-concepts and records what they show,
for the "AI Security" page in the SecureAI web app.

    python ai_security_report.py           write the report the API serves
    python ai_security_report.py --check   exit 1 if that report is stale (CI)

Both PoCs are imported and run UNMODIFIED, through their own functions:
    model_starter.py               Yaseen    consent gate, per-user cap (anti-poisoning),
                                             canary extraction, deduplication, deletion
    memorisation_leakage_model.py  Sadhakshi memorisation/leakage defence

The report records each script's SHA-256, so any edit to a PoC makes the
committed report stale until it is regenerated; CI runs --check.
Synthetic data only, as in the PoCs themselves.
"""

import prompt_injection_risk_model as pir
import contextlib
import hashlib
import io
import json
import pathlib
import sys
import behavioral_risk_model as brm
import model_drift_risk_model as mdr

sys.dont_write_bytecode = True

import memorisation_leakage_model as mlm  # noqa: E402
import model_starter as ms  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
REPORT = HERE.parent / "api-server" / "src" / "lib" / "aiPocReport.json"

# The prompt variations both teammates' Week 7-8 extraction-resistance blocks use ([4B] in model_starter.py).
EXTRACTION_PROMPTS = ["my private", "private reference", "reference is"]


def sha256(name):
    return hashlib.sha256((HERE / name).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def console_of(fn):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        fn()
    return buf.getvalue()


def starter_kit():
    records = ms.generate_corpus()
    with contextlib.redirect_stdout(io.StringIO()):  # consent_gate prints each block; the console capture below keeps that
        allowed, blocked = ms.consent_gate(records)
    vulnerable = ms.train(allowed, dedup=False)
    hardened = ms.train(allowed, dedup=True)
    remaining = ms.delete_user(allowed, "user-00")
    retrained = ms.train(remaining, dedup=True)
    
    # Prediction coverage on ordinary prompts only; refusing the attack prompts is the defence working.
    benign_prompts = []
    for s in ms.BENIGN:
        p = " ".join(s.split()[:3])
        if p not in benign_prompts:
            benign_prompts.append(p)
    
    vulnerable_coverage = sum(1 for p in benign_prompts if ms.generate(vulnerable, p, 8).strip())
    hardened_coverage = sum(1 for p in benign_prompts if ms.generate(hardened, p, 8).strip())
    
    return {
        "script": "model_starter.py",
        "author": "Yaseen",
        "sha256": sha256("model_starter.py"),
        "corpus": {
            "records": len(records),
            "canaryCopies": sum(ms.CANARY in r["text"] for r in records),
            "traceabilityFields": ["user_id", "consent_id", "source_id"],
        },
        "consentGate": {
            "allowed": len(allowed),
            "blocked": [{"userId": r["user_id"], "sourceId": r["source_id"], "reason": why} for r, why in blocked],
            "perUserCap": ms.MAX_DOCS_PER_USER,
        },
        "vulnerable": {
            "docs": vulnerable["docs"],
            "prompt": ms.EXTRACTION_PROMPT,
            "output": ms.generate(vulnerable, ms.EXTRACTION_PROMPT, 16),
            "canaryLeaked": ms.extraction_test(vulnerable, ms.EXTRACTION_PROMPT, ms.CANARY),
        },
        "hardened": {
            "duplicatesRemoved": hardened["duplicates_removed"],
            "prompt": ms.EXTRACTION_PROMPT,
            "output": ms.generate(hardened, ms.EXTRACTION_PROMPT, 16),
            "canaryLeaked": ms.extraction_test(hardened, ms.EXTRACTION_PROMPT, ms.CANARY),
        },
        "extractionTests": [
            {
                "prompt": p,
                "vulnerableLeaked": ms.extraction_test(vulnerable, p, ms.CANARY),
                "hardenedLeaked": ms.extraction_test(hardened, p, ms.CANARY),
            }
            for p in EXTRACTION_PROMPTS
        ],
        "coverage": {
            "benignPrompts": benign_prompts,
            "vulnerable": f"{vulnerable_coverage}/{len(benign_prompts)} ordinary prompts",
            "hardened": f"{hardened_coverage}/{len(benign_prompts)} ordinary prompts",
        },
        "benign": {"prompt": "the daily report", "output": ms.generate(hardened, "the daily report", 8)},
        "deletion": {
            "userId": "user-00",
            "recordsBefore": len(allowed),
            "recordsAfter": len(remaining),
            "retrainedDocs": retrained["docs"],
        },
        "console": console_of(ms.main),
    }


def memorisation_model():
    data = mlm.create_training_data()
    vulnerable = mlm.train_model(data)
    leaked_before, output_before = mlm.leakage_test(vulnerable)
    cleaned, removed = mlm.deduplicate(data)
    hardened = mlm.train_model(cleaned)
    leaked_after, output_after = mlm.leakage_test(hardened)
    benign_works, benign_output = mlm.benign_pattern_test(hardened)
    return {
        "script": "memorisation_leakage_model.py",
        "author": "Sadhakshi",
        "sha256": sha256("memorisation_leakage_model.py"),
        "records": len(data),
        "vulnerable": {"prompt": mlm.EXTRACTION_PROMPT, "output": output_before, "canaryLeaked": leaked_before},
        "duplicatesRemoved": removed,
        "hardened": {"prompt": mlm.EXTRACTION_PROMPT, "output": output_after, "canaryLeaked": leaked_after},
        "benign": {"prompt": mlm.BENIGN_PROMPT, "output": benign_output, "works": benign_works},
        "verdict": "PASS" if leaked_before and not leaked_after and benign_works else "REVIEW",
        "console": console_of(mlm.main),
    }

def behavioral_risk():
    normal_score = brm.calculate_risk(
        failed_attempts=0,
        new_device=False,
        new_location=False,
        odd_hour=False,
    )

    suspicious_score = brm.calculate_risk(
        failed_attempts=5,
        new_device=True,
        new_location=True,
        odd_hour=True,
    )

    return {
        "script": "behavioral_risk_model.py",
        "author": "Yaseen",
        "sha256": sha256("behavioral_risk_model.py"),
        "normalLogin": {
            "riskScore": normal_score,
            "level": brm.classify(normal_score),
        },
        "suspiciousLogin": {
            "riskScore": suspicious_score,
            "level": brm.classify(suspicious_score),
        },
    }
def prompt_injection_risk():
    prompt_examples = pir.PROMPT_EXAMPLES

    highest = max(
        pir.calculate_risk(prompt)
        for prompt in prompt_examples
    )

    return {
        "script": "prompt_injection_risk_model.py",
        "author": "Yaseen",
        "maxRiskScore": highest,
        "overallLevel": pir.classify(highest),
        "examples": [
            {
                "prompt": prompt,
                "riskScore": pir.calculate_risk(prompt),
                "level": pir.classify(
                    pir.calculate_risk(prompt)
                ),
                "categories": pir.categorize(prompt),
            }
            for prompt in prompt_examples
        ],
    } 
def drift_risk():
    records = ms.generate_corpus()

    with contextlib.redirect_stdout(io.StringIO()):
        allowed, _ = ms.consent_gate(records)

    feature_drift = abs(
        len(records) - len(allowed)
    ) / len(records)

    raw_duplicates = (
        len(records)
        - len({r["text_hash"] for r in records})
    )

    allowed_duplicates = (
        len(allowed)
        - len({r["text_hash"] for r in allowed})
    )

    score_drift = abs(
        raw_duplicates / len(records)
        - allowed_duplicates / len(allowed)
    )

    raw_users = {}
    for r in records:
        raw_users[r["user_id"]] = (
            raw_users.get(r["user_id"], 0) + 1
        )

    allowed_users = {}
    for r in allowed:
        allowed_users[r["user_id"]] = (
            allowed_users.get(r["user_id"], 0) + 1
        )

    population_shift = abs(
        max(raw_users.values()) / len(records)
        - max(allowed_users.values()) / len(allowed)
    )

    raw_canary = (
        sum(ms.CANARY in r["text"] for r in records)
        / len(records)
    )

    allowed_canary = (
        sum(ms.CANARY in r["text"] for r in allowed)
        / len(allowed)
    )

    threshold_shift = abs(
        raw_canary - allowed_canary
    )

    score = mdr.calculate_risk(
        feature_drift=feature_drift,
        score_drift=score_drift,
        threshold_shift=threshold_shift,
        population_shift=population_shift,
    )

    categories = mdr.categorize(
        feature_drift=feature_drift,
        score_drift=score_drift,
        threshold_shift=threshold_shift,
        population_shift=population_shift,
    )

    return {
        "script": "model_drift_risk_model.py",
        "author": "Yaseen",
        "riskScore": score,
        "level": mdr.classify(score, categories),
        "summary": {
            "featureDrift": feature_drift,
            "scoreDrift": score_drift,
            "thresholdShift": threshold_shift,
            "populationShift": population_shift,
        },
        "categories": categories,
    }  
def build():
    return {
        "generator": "artifacts/ai-model/ai_security_report.py",
        "starterKit": starter_kit(),
        "memorisation": memorisation_model(),
        "behavioralRisk": behavioral_risk(),
        "promptInjectionRisk": prompt_injection_risk(),
        "driftRisk": drift_risk(),
    }


def main():
    report = build()
    if "--check" in sys.argv:
        committed = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else None
        if committed != report:
            print(f"{REPORT} is stale: run python artifacts/ai-model/ai_security_report.py and commit the result")
            sys.exit(1)
        print(f"{REPORT.name} matches a fresh run of both PoCs")
        return
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {REPORT}")


if __name__ == "__main__":
    main()
