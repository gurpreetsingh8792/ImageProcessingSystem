import React, { useState } from 'react';
import axios from 'axios';

function StatusChecker() {
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  const handleInputChange = (event) => {
    setRequestId(event.target.value);
  };

  const handleCheckStatus = async () => {
    if (!requestId.trim()) {
      alert('Please enter a request ID');
      return;
    }
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:5000/api/status/${requestId}`);
      setStatus(response.data.status);
      if (response.data.status === 'Completed') {
        setDownloadUrl(`http://localhost:5000/api/export?requestId=${requestId}`);
      } else {
        setDownloadUrl('');
      }
    } catch (error) {
      console.error('Error checking status:', error);
      setStatus('Failed to retrieve status.');
      setDownloadUrl('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    window.open(downloadUrl, '_blank');
  };

  return (
    <div>
      <h1>Check Processing Status</h1>
      <input type="text" value={requestId} onChange={handleInputChange} placeholder="Enter Request ID" />
      <button onClick={handleCheckStatus} disabled={loading}>
        {loading ? 'Checking...' : 'Check Status'}
      </button>
      {status && <p>Status: {status}</p>}
      {status === 'Completed' && downloadUrl && (
        <button onClick={handleDownload}>
          Download Output CSV
        </button>
      )}
    </div>
  );
}

export default StatusChecker;
