# StealthDOM Window State Test Report

This report verifies the integrity of headless operations across different physical window states.

## Phase: Normal & Visible (Expected: `normal`)

| Action | Status | Pre-State | Post-State | Duration |
|---|---|---|---|---|
| CDP Screenshot (Existing Tab) | ✅ PASS | `normal` | `normal` | 0.1s |
| CDP Evaluate (Existing Tab) | ✅ PASS | `normal` | `normal` | 0.0s |
| CDP Full Page Screenshot (Existing Tab) | ✅ PASS | `normal` | `normal` | 0.4s |
| CDP Screenshot (Newly Created Background Tab) | ✅ PASS | `normal` | `normal` | 0.2s |

## Phase: Occluded (Covered by maximized app) (Expected: `normal`)

| Action | Status | Pre-State | Post-State | Duration |
|---|---|---|---|---|
| CDP Screenshot (Existing Tab) | ✅ PASS | `normal` | `normal` | 0.1s |
| CDP Evaluate (Existing Tab) | ✅ PASS | `normal` | `normal` | 0.0s |
| CDP Full Page Screenshot (Existing Tab) | ✅ PASS | `normal` | `normal` | 0.2s |
| CDP Screenshot (Newly Created Background Tab) | ✅ PASS | `normal` | `normal` | 0.2s |

## Phase: Minimized (Expected: `minimized`)

| Action | Status | Pre-State | Post-State | Duration |
|---|---|---|---|---|
| CDP Screenshot (Existing Tab) | ✅ PASS | `minimized` | `minimized` | 3.3s |
| CDP Evaluate (Existing Tab) | ✅ PASS | `minimized` | `minimized` | 0.0s |
| CDP Full Page Screenshot (Existing Tab) | ✅ PASS | `minimized` | `minimized` | 5.3s |
| CDP Screenshot (Newly Created Background Tab) | ⏱️ TIMEOUT | `minimized` | `minimized` | 30.0s |

