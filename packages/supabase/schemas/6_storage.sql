-- bucket privado club-archivos y políticas RESTRICTIVE sobre storage.objects.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-archivos', 'club-archivos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Restrictive policies remain effective even if another permissive bucket policy is later added.
CREATE POLICY club_archivos_lectura_por_autoridad ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated, anon USING (bucket_id <> 'club-archivos');

CREATE POLICY club_archivos_insert_por_autoridad ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated, anon WITH CHECK (bucket_id <> 'club-archivos');

CREATE POLICY club_archivos_update_por_autoridad ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated, anon USING (bucket_id <> 'club-archivos') WITH CHECK (bucket_id <> 'club-archivos');

CREATE POLICY club_archivos_delete_por_autoridad ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated, anon USING (bucket_id <> 'club-archivos');
