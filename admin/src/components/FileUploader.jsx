import React, { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export default function FileUploader({ schoolSlug, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    setError('');
    setProgress('');

    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only PDF, DOCX, and TXT files are supported.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('File must be under 10MB.');
      return;
    }

    setUploading(true);
    setProgress('Uploading file...');

    try {
      const ext = file.name.split('.').pop();
      const filename = `${schoolSlug}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from('documents')
        .upload(filename, file, { contentType: file.type });

      if (storageError) throw new Error(storageError.message);

      setProgress('Processing document...');

      await api.processDocument({
        schoolId: schoolSlug,
        storagePath: storageData.path,
        fileType: file.type,
        fileName: file.name,
        fileSize: file.size,
      });

      setProgress('');
      onUploaded?.();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <div className="text-4xl mb-3">📄</div>
        {uploading ? (
          <p className="text-blue-600 font-medium">{progress}</p>
        ) : (
          <>
            <p className="font-medium text-gray-700">Drop files here or click to browse</p>
            <p className="text-sm text-gray-400 mt-1">PDF, DOCX, TXT — max 10MB</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}
      />

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
