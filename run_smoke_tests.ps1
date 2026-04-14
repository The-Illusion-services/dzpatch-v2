$env:FOODHUNT_DZPATCH_INTEGRATION="1"
npx jest __tests__/integration/foodhunt-dzpatch-staging-smoke.test.ts --runInBand *>&1 | Out-File -FilePath "smoke_test_results.txt" -Encoding utf8
