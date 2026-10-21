update pricing_settings
set settings = jsonb_set(
  jsonb_set(settings, '{Ghana,activationFee}', '55'::jsonb),
  '{Nigeria,activationFee}', '6655'::jsonb
), updated_at = now()
where id = 'main';
