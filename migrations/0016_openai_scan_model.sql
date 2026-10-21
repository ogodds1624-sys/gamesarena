-- Pending encrypted images remain usable; completed reports retain their model history.
update virtual_scan_jobs set model='gpt-4.1-mini',updated_at=now()
where status in ('queued','processing') and model like 'claude-%';
