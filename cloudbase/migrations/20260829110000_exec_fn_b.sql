-- ============================================================
-- exec_fn.sql · 通用 SQL 执行函数（CloudBase 共享集群适配层的一部分）
-- 背景：体验版环境不开放数据库直连（无账号/地址），
--       服务端只能通过 PostgREST RPC（service_role 身份）访问数据库。
-- 方案：本函数接收一组 SQL，在单个事务内逐条执行，
--       每条返回 {rows:[...], changes:n}，等价于 D1 的 batch 语义。
-- 安全：仅授权 service_role（服务器 API Key）执行；
--       anon/authenticated（浏览器）一律拒绝。
-- ============================================================

CREATE OR REPLACE FUNCTION public.exec_sql(p_sqls jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  out jsonb := '[]'::jsonb;
  i int;
  s text;
  verb text;
  rec record;
  v_rows jsonb;
  nrows int;
BEGIN
  FOR i IN 1 .. jsonb_array_length(p_sqls) LOOP
    s := (p_sqls->(i - 1)) #>> '{}';
    -- 取首个单词判断语句类型：SELECT/WITH 遍历结果集，其余按 DML 取影响行数
    verb := upper(coalesce((regexp_match(s, '[[:space:]]*([[:alpha:]]+)'))[1], ''));
    v_rows := '[]'::jsonb;
    nrows := 0;
    IF verb IN ('SELECT', 'WITH', 'SHOW', 'VALUES', 'TABLE') THEN
      FOR rec IN EXECUTE s LOOP
        v_rows := v_rows || (row_to_json(rec))::jsonb;
        nrows := nrows + 1;
      END LOOP;
    ELSE
      EXECUTE s;
      GET DIAGNOSTICS nrows = ROW_COUNT;
    END IF;
    out := out || jsonb_build_object('rows', v_rows, 'changes', nrows, 'verb', verb, 'sql', s);
  END LOOP;
  RETURN out;
END;
$$;

-- 权限收紧：浏览器角色一律拒绝，只允许服务器（service_role）和高权限运维角色调用
REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(jsonb) TO service_role;
