# E2E Test Infra: IPC Manager

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | ONVIF Discovery | ORIGINAL_REQUEST R1 | 5      | 5      | ✓      |
| 2 | Live View | ORIGINAL_REQUEST R2 | 5      | 5      | ✓      |
| 3 | Record to Disk | ORIGINAL_REQUEST R3 | 5      | 5      | ✓      |

## Test Architecture
- Test runner: `npx playwright test`
- Test case format: Playwright TypeScript tests inside `e2e/` folder.
- Expected: all tests pass with exit code 0.
- Testing environment: Tests will run against a started instance of the frontend and backend. Backend will need to support a "test mode" or use real local mock files/streams to not depend on physical ONVIF cameras.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | User opens app, discovers cameras, selects one to view live | F1, F2 | Medium |
| 2 | User views live stream, starts recording, stops recording, file is verified | F2, F3 | High |
| 3 | User discovers cameras, starts recording without viewing live, stops recording | F1, F3 | High |
| 4 | User discovers cameras, views live stream, network fluctuates (mocked), stops viewing | F1, F2 | Medium |
| 5 | End-to-end full workflow: discovery, live view, record, stop, verify | F1, F2, F3 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (Total 15)
- Tier 2: ≥5 per feature (Total 15)
- Tier 3: pairwise coverage of major feature interactions (Total 3 combinations: F1+F2, F2+F3, F1+F3, let's say 5 tests)
- Tier 4: ≥5 realistic application scenarios
- Total: ~40 test cases
