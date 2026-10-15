-- Migration 005: Add University of Abuja CDL, Igbinedion University CDL, Kenbridge Open University
-- Run this in the Supabase SQL editor for the EABT project.

INSERT INTO public.schools (slug, name, staff_email, branding) VALUES
  (
    'uniabuja',
    'University of Abuja Centre for Distance Learning And Continuing Education',
    'admin@uniabuja.edu.ng',
    '{"primaryColor":"#003366"}'
  ),
  (
    'igbinedion',
    'Igbinedion University Centre for Distance Learning',
    'admin@igbinedion.edu.ng',
    '{"primaryColor":"#006600"}'
  ),
  (
    'kenbridge',
    'Kenbridge Open University',
    'admin@kenbridge.edu.ng',
    '{"primaryColor":"#8B0000"}'
  )
ON CONFLICT (slug) DO NOTHING;
