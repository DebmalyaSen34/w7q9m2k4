# Verification record

Verified on October 25, 2026 using the real Elexon snapshot `a52e07307098234e`.

| Check | Result |
| --- | --- |
| Python correctness and API tests | 29 passed locally and in CI |
| TypeScript and Vite production build | Passed locally, in CI, and on Vercel |
| Browser scenarios | 5 passed locally and against the public production URL |
| Desktop and mobile visual inspection | Reviewed forecast, accuracy, and table views; mobile overflow test passed |
| Docker multi-stage build and startup | Passed in GitHub Actions on Ubuntu 24.04 |
| Docker API smoke test | Health response and January 31 → February 1 forecast passed |
| Unauthenticated production access | Public API and fresh browser contexts passed |
| Data | 1,488 actual readings; 17,864 revisions; 744/744 matched hours at 09:00 |
| npm dependency audit | No reported vulnerabilities after updating Vite to 7.3.7 |
| Source formatting | Prettier check passed |
| Demo | MP4 generated with synthesized narration; under five minutes |

CI evidence for implementation commit `063c6d71b0f73184cc0caf04f11022808c47ae33`: https://github.com/DebmalyaSen34/w7q9m2k4/actions/runs/40176684665

Production app: https://w7q9m2k4.vercel.app

The local Mac did not have Docker, so container verification ran in GitHub Actions. The initial CI run encountered an unsupported Ubuntu version; pinning the runner to Ubuntu 24.04 resolved it. The first Vercel deployment omitted Python dependencies because project metadata took precedence over requirements.txt; declaring the dependencies in pyproject.toml resolved the runtime import error. The subsequent production browser suite passed.

The video is a prepared local deliverable. It has not been uploaded to YouTube or submitted to the challenge form.
