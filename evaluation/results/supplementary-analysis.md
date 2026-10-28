# Supplementary Evaluation Analysis

Generated at: `2026-09-10T21:41:34.908825+00:00`
Dialogue-level bootstrap seed: `20260825`
Bootstrap repetitions: `1000`
Main evaluation dialogues: `213`

> These analyses are exploratory and supplementary to the frozen primary results. They use saved predictions only, make no provider calls, and do not replace the primary evaluation.

## Verification gate

The frozen prompt-v1 concept F1 and assertion-aware F1 values were reproduced at full numerical precision before any output was written.

| Provider | Concept F1 | Assertion-aware F1 | Gate |
| --- | --- | --- | --- |
| openai | 0.4867 | 0.4632 | Passed |
| anthropic | 0.4850 | 0.4655 | Passed |
| ollama | 0.2988 | 0.2825 | Passed |

## 1. Paired prompt comparison

| Provider | Metric | V1 | V2 | V2 - V1 | 95% CI | Excludes 0 |
| --- | --- | --- | --- | --- | --- | --- |
| openai | conceptPrecision | 0.4573 | 0.5635 | 0.1062 | [0.0965, 0.1157] | Yes |
| openai | conceptRecall | 0.5201 | 0.5822 | 0.0621 | [0.0522, 0.0727] | Yes |
| openai | conceptF1 | 0.4867 | 0.5727 | 0.0860 | [0.0766, 0.0949] | Yes |
| openai | assertionAwareF1 | 0.4632 | 0.5430 | 0.0799 | [0.0695, 0.0897] | Yes |
| anthropic | conceptPrecision | 0.4901 | 0.6364 | 0.1463 | [0.1320, 0.1602] | Yes |
| anthropic | conceptRecall | 0.4799 | 0.5598 | 0.0799 | [0.0614, 0.0960] | Yes |
| anthropic | conceptF1 | 0.4850 | 0.5957 | 0.1107 | [0.0976, 0.1234] | Yes |
| anthropic | assertionAwareF1 | 0.4655 | 0.5760 | 0.1105 | [0.0968, 0.1234] | Yes |
| ollama | conceptPrecision | 0.4758 | 0.5440 | 0.0682 | [0.0451, 0.0932] | Yes |
| ollama | conceptRecall | 0.2178 | 0.2300 | 0.0122 | [-0.0129, 0.0381] | No |
| ollama | conceptF1 | 0.2988 | 0.3233 | 0.0245 | [-0.0006, 0.0504] | No |
| ollama | assertionAwareF1 | 0.2825 | 0.3056 | 0.0232 | [-0.0021, 0.0488] | No |

Positive differences favour prompt v2. Because prompt v2 was written after inspecting v1 results, these intervals describe a post-hoc exploratory comparison and do not establish an unbiased prompt effect.

## 2. Evidence formatting sensitivity

| Prompt | Provider | Evidence items | Matched | Exact | Normalised | Adjacent-turn |
| --- | --- | --- | --- | --- | --- | --- |
| v1 | openai | 5698 | 5599 | 0.9709 | 0.9782 | 0.9826 |
| v1 | anthropic | 4901 | 4780 | 0.6409 | 0.6503 | 0.9753 |
| v1 | ollama | 2292 | 2085 | 0.8290 | 0.8556 | 0.9097 |
| v2 | openai | 5176 | 5088 | 0.9322 | 0.9730 | 0.9830 |
| v2 | anthropic | 4408 | 4282 | 0.4451 | 0.4510 | 0.9714 |
| v2 | ollama | 2117 | 2020 | 0.8517 | 0.8729 | 0.9542 |

This sensitivity metric removes speaker labels and permits evidence to match within one transcript turn or one pair of adjacent turns. It handles question-plus-short-answer evidence without joining distant parts of a dialogue. The results show that much of the lower exact evidence rate was a formatting effect. This tolerant metric does not prove that every matched span is clinically sufficient.

## 3. Self-reported confidence

| Prompt | Provider | Outcome | N | Distinct | Mean correct | Mean incorrect | Rank AUC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | openai | conceptCorrect | 5692 | 31 | 0.9838 | 0.9804 | 0.5566 |
| v1 | openai | assertionAwareCorrect | 5662 | 31 | 0.9878 | 0.9778 | 0.5848 |
| v1 | anthropic | conceptCorrect | 4901 | 11 | 0.9682 | 0.9655 | 0.5274 |
| v1 | anthropic | assertionAwareCorrect | 4874 | 11 | 0.9734 | 0.9615 | 0.5488 |
| v1 | ollama | conceptCorrect | 2291 | 5 | 0.9935 | 0.9978 | 0.4928 |
| v1 | ollama | assertionAwareCorrect | 2271 | 5 | 0.9984 | 0.9941 | 0.5054 |
| v2 | openai | conceptCorrect | 5171 | 24 | 0.9886 | 0.9817 | 0.5695 |
| v2 | openai | assertionAwareCorrect | 5142 | 23 | 0.9929 | 0.9776 | 0.6097 |
| v2 | anthropic | conceptCorrect | 4403 | 13 | 0.9637 | 0.9574 | 0.5311 |
| v2 | anthropic | assertionAwareCorrect | 4369 | 13 | 0.9664 | 0.9543 | 0.5559 |
| v2 | ollama | conceptCorrect | 2116 | 11 | 0.9877 | 0.9924 | 0.4923 |
| v2 | ollama | assertionAwareCorrect | 2093 | 11 | 0.9931 | 0.9877 | 0.5108 |

The compact table below shows the 0.90 threshold. All five thresholds are available in `confidence-thresholds.csv`.

| Prompt | Provider | Outcome | Coverage | Retained precision |
| --- | --- | --- | --- | --- |
| v1 | openai | conceptCorrect | 0.9731 | 0.4566 |
| v1 | openai | assertionAwareCorrect | 0.9740 | 0.4393 |
| v1 | anthropic | conceptCorrect | 0.9429 | 0.4928 |
| v1 | anthropic | assertionAwareCorrect | 0.9440 | 0.4786 |
| v1 | ollama | conceptCorrect | 0.9873 | 0.4721 |
| v1 | ollama | assertionAwareCorrect | 0.9881 | 0.4492 |
| v2 | openai | conceptCorrect | 0.9729 | 0.5669 |
| v2 | openai | assertionAwareCorrect | 0.9736 | 0.5421 |
| v2 | anthropic | conceptCorrect | 0.9350 | 0.6417 |
| v2 | anthropic | assertionAwareCorrect | 0.9364 | 0.6263 |
| v2 | ollama | conceptCorrect | 0.9688 | 0.5390 |
| v2 | ollama | assertionAwareCorrect | 0.9709 | 0.5153 |

Rank AUC measures ordering, not probability calibration. These self-reported confidence values must not be interpreted as clinical risk probabilities or used to auto-accept findings from this test-set analysis.

## 4. Frozen alias-table ablation

| Prompt | Provider | Condition | Precision | Recall | Concept F1 | F1 delta | Assertion F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | openai | no-alias | 0.2788 | 0.3166 | 0.2965 | 0.0000 | 0.2801 |
| v1 | openai | frozen-alias | 0.4573 | 0.5201 | 0.4867 | 0.1902 | 0.4632 |
| v1 | anthropic | no-alias | 0.3061 | 0.2993 | 0.3026 | 0.0000 | 0.2888 |
| v1 | anthropic | frozen-alias | 0.4901 | 0.4799 | 0.4850 | 0.1823 | 0.4655 |
| v1 | ollama | no-alias | 0.2859 | 0.1307 | 0.1794 | 0.0000 | 0.1679 |
| v1 | ollama | frozen-alias | 0.4758 | 0.2178 | 0.2988 | 0.1194 | 0.2825 |
| v2 | openai | no-alias | 0.3284 | 0.3390 | 0.3336 | 0.0000 | 0.3147 |
| v2 | openai | frozen-alias | 0.5635 | 0.5822 | 0.5727 | 0.2391 | 0.5430 |
| v2 | anthropic | no-alias | 0.3529 | 0.3101 | 0.3301 | 0.0000 | 0.3173 |
| v2 | anthropic | frozen-alias | 0.6364 | 0.5598 | 0.5957 | 0.2656 | 0.5760 |
| v2 | ollama | no-alias | 0.3280 | 0.1385 | 0.1947 | 0.0000 | 0.1813 |
| v2 | ollama | frozen-alias | 0.5440 | 0.2300 | 0.3233 | 0.1285 | 0.3056 |

The provider outputs are identical in both conditions. The difference measures how the frozen equivalence table changes scoring; it is not a change in model capability. No location, fuzzy or UMLS rule was added.

## 5. Recall by assertion class

| Prompt | Provider | Class | Gold | Located | Correct assertion | Concept recall | Conditional accuracy | End-to-end recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | openai | PRESENT | 1316 | 725 | 664 | 0.5509 | 0.9159 | 0.5046 |
| v1 | openai | NEGATED | 3529 | 1814 | 1763 | 0.5140 | 0.9719 | 0.4996 |
| v1 | openai | UNCERTAIN | 64 | 34 | 21 | 0.5312 | 0.6176 | 0.3281 |
| v1 | anthropic | PRESENT | 1316 | 715 | 663 | 0.5433 | 0.9273 | 0.5038 |
| v1 | anthropic | NEGATED | 3529 | 1631 | 1597 | 0.4622 | 0.9792 | 0.4525 |
| v1 | anthropic | UNCERTAIN | 64 | 29 | 17 | 0.4531 | 0.5862 | 0.2656 |
| v1 | ollama | PRESENT | 1316 | 633 | 611 | 0.4810 | 0.9652 | 0.4643 |
| v1 | ollama | NEGATED | 3529 | 422 | 397 | 0.1196 | 0.9408 | 0.1125 |
| v1 | ollama | UNCERTAIN | 64 | 15 | 6 | 0.2344 | 0.4000 | 0.0938 |
| v2 | openai | PRESENT | 1316 | 807 | 730 | 0.6132 | 0.9046 | 0.5547 |
| v2 | openai | NEGATED | 3529 | 2041 | 1974 | 0.5784 | 0.9672 | 0.5594 |
| v2 | openai | UNCERTAIN | 64 | 37 | 25 | 0.5781 | 0.6757 | 0.3906 |
| v2 | anthropic | PRESENT | 1316 | 828 | 779 | 0.6292 | 0.9408 | 0.5919 |
| v2 | anthropic | NEGATED | 3529 | 1906 | 1875 | 0.5401 | 0.9837 | 0.5313 |
| v2 | anthropic | UNCERTAIN | 64 | 34 | 18 | 0.5312 | 0.5294 | 0.2812 |
| v2 | ollama | PRESENT | 1316 | 708 | 682 | 0.5380 | 0.9633 | 0.5182 |
| v2 | ollama | NEGATED | 3529 | 398 | 377 | 0.1128 | 0.9472 | 0.1068 |
| v2 | ollama | UNCERTAIN | 64 | 22 | 11 | 0.3438 | 0.5000 | 0.1719 |

The 96 gold assertion conflicts are excluded because they have no single reliable class label. Class recall is safety-relevant coverage within this simulated corpus; it does not establish clinical safety or generalisation to real patients.
