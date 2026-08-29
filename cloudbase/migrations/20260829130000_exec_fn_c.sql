-- v3：DML 分支新增 last_row_id（安全取 lastval，无序列时置 0），供 RPC 适配器对齐 D1 的 meta.last_row_id
CREATE OR REPLACE FUNCTION public.exec_sql(p_sqls jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  out jsonb := '[]'::jsonb;
  i int;
  s text;
  verb text;
  rec record;
  v_rows jsonb;
  nrows int;
  last_id bigint;
BEGIN
  FOR i IN 1 .. jsonb_array_length(p_sqls) LOOP
    s := (p_sqls->(i - 1)) #>> '{}';
    verb := upper(coalesce((regexp_match(s, '[[:space:]]*([[:alpha:]]+)'))[1], ''));
    v_rows := '[]'::jsonb;
    nrows := 0;
    last_id := 0;
    IF verb IN ('SELECT', 'WITH', 'SHOW', 'VALUES', 'TABLE') THEN
      FOR rec IN EXECUTE s LOOP
        v_rows := v_rows || (row_to_json(rec))::jsonb;
        nrows := nrows + 1;
      END LOOP;
    ELSE
      EXECUTE s;
      GET DIAGNOSTICS nrows = ROW_COUNT;
      BEGIN
        last_id := lastval();
      EXCEPTION WHEN OTHERS THEN
        last_id := 0;
      END;
    END IF;
    out := out || jsonb_build_object('rows', v_rows, 'changes', nrows, 'last_row_id', last_id, 'verb', verb, 'sql', s);
  END LOOP;
  RETURN out;
END;
$func$;

REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(jsonb) TO service_role;
