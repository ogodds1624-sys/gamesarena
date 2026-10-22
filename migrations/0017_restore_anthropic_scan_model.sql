-- Preserve completed history and charges; only pending OpenAI jobs change provider.
update virtual_scan_jobs
set model='claude-sonnet-5-5',updated_at=now()
where status in ('queued','processing') and model not like 'claude-%';
