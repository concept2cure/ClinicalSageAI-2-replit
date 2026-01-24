import React, { useState, useCallback } from 'react';

// Simple FileDropzone component instead of using react-dropzone
const FileDropzone = ({ onDrop, accept }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    e => {
      e.preventDefault();
      e.stopPropagation();

      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDrop(e.dataTransfer.files);
      }
    },
    [onDrop]
  );

  const handleChange = useCallback(
    e => {
      e.preventDefault();

      if (e.target.files && e.target.files.length > 0) {
        onDrop(e.target.files);
      }
    },
    [onDrop]
  );

  return (
    <div
      className={`dropzone ${dragActive ? 'active' : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden-input"
        accept={accept}
        onChange={handleChange}
      />
      <label htmlFor="file-upload" className="drop-label">
        <div>
          <p>Drag and drop files here, or click to select files</p>
          <p className="small">Accepted file types: {accept}</p>
        </div>
      </label>
    </div>
  );
};

const UploadValidateCard = ({ onFilesUploaded, acceptedFileTypes, title, description }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleDrop = useCallback(acceptedFiles => {
    setFiles(Array.from(acceptedFiles));
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) {
      setError('Please select at least one file to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // In a real implementation, we would upload the files to the server
      // For this example, we'll just simulate a successful upload
      await new Promise(resolve => setTimeout(resolve, 1000));

      onFilesUploaded(files);
    } catch (err) {
      setError(err.message || 'An error occurred during upload');
    } finally {
      setUploading(false);
    }
  }, [files, onFilesUploaded]);

  return (
    <div className="upload-validate-card">
      <div className="card-header">
        <h2>{title || 'Upload Files'}</h2>
        <p>{description || 'Upload your files to begin processing'}</p>
      </div>

      <div className="card-body">
        <FileDropzone onDrop={handleDrop} accept={acceptedFileTypes || '*'} />

        {files.length > 0 && (
          <div className="file-list">
            <h3>Selected Files</h3>
            <ul>
              {files.map((file, index) => (
                <li key={index}>
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="card-footer">
        <button
          className={`upload-button ${uploading ? 'uploading' : ''}`}
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
        >
          {uploading ? 'Uploading...' : 'Upload Files'}
        </button>
      </div>
    </div>
  );
};

export default UploadValidateCard;
