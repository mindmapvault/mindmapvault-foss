export async function downloadBlob(blob: Blob, filename: string) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Append to DOM so the link is clickable in all envs
    document.body.appendChild(a);
    // Use timeout to avoid potential immediate DOM removal race
    setTimeout(() => {
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, 50);
  } catch (err) {
    // Fallback: try data URL download
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        setTimeout(() => { a.click(); document.body.removeChild(a); }, 50);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      throw e;
    }
  }
}

export async function downloadDataUrl(dataUrl: string, filename: string) {
  // Convert data URL to blob and use downloadBlob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return downloadBlob(blob, filename);
}
