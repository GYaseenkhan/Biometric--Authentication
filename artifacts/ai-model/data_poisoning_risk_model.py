"""
Data Poisoning Risk Score
Synthetic AI Security PoC.
"""


def calculate_risk(
    duplicate_records: int,
    single_user_ratio: float,
    canary_frequency: float,
    source_diversity: float,
):
    score = 0

    score += min(duplicate_records * 5, 30)

    if single_user_ratio > 0.5:
        score += 25

    if canary_frequency > 0.2:
        score += 25

    if source_diversity < 0.4:
        score += 20

    return min(score, 100)


def classify(score: int):
    if score >= 80:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def main():
    score = calculate_risk(
        duplicate_records=8,
        single_user_ratio=0.7,
        canary_frequency=0.3,
        source_diversity=0.2,
    )

    print(
        f"Poisoning Risk: {score} ({classify(score)})"
    )


if __name__ == "__main__":
    main()