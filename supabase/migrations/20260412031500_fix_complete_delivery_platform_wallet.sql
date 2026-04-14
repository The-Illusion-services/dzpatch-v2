-- Keep complete_delivery platform commission postings on the canonical
-- platform wallet. Older staging data can contain multiple platform wallets,
-- and LIMIT 1 can credit the wrong ledger.

DO $$
DECLARE
    v_sql text;
    v_old text := 'WHERE owner_type = ''platform''
    LIMIT 1;';
    v_new text := 'WHERE owner_type = ''platform''
      AND owner_id = ''00000000-0000-0000-0000-000000000001''::uuid
    ORDER BY created_at DESC
    LIMIT 1;';
BEGIN
    SELECT pg_get_functiondef('public.complete_delivery(uuid, uuid, text)'::regprocedure)
    INTO v_sql;

    IF v_sql IS NULL THEN
        RAISE EXCEPTION 'public.complete_delivery(uuid, uuid, text) was not found';
    END IF;

    v_sql := replace(v_sql, v_old, v_new);

    IF position(v_new in v_sql) = 0 THEN
        RAISE EXCEPTION 'Could not patch complete_delivery platform wallet lookup';
    END IF;

    EXECUTE v_sql;
END;
$$;
