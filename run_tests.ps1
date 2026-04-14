$env:FOODHUNT_DZPATCH_INTEGRATION="1"
npx jest __tests__/supabase/rpc/partner-delivery-repair.test.ts __tests__/supabase/rpc/delivery-code-secret.test.ts __tests__/supabase/rpc/orders.test.ts __tests__/supabase/rpc/complete-delivery.test.ts --runInBand *>&1 | Out-File -FilePath "test_results.txt" -Encoding utf8
