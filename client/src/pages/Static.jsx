import { Link } from 'react-router-dom';
import { useTitle } from '../services/context';
export function Privacy() {
  useTitle('Privacy Policy');
  return (<section className="narrow prose"><h2>Privacy Policy</h2>
    <p>Files you upload are processed on our server only to perform the conversion you request. The uploaded file is deleted immediately after conversion finishes (or fails). The converted file is stored in temporary storage and removed by an automatic cleanup about 30 minutes after creation.</p>
    <p>If you create an account we store your name, email and a hashed password. For signed-in users we also store the file name, formats, status and time of each conversion; never the file contents. Guest conversions are not recorded.</p>
    <p>The public visitors list shows the name and optional message you choose to submit, plus the date. It is visible to everyone, so do not enter private information. We do not store your IP address with the entry, and an administrator can remove entries.</p>
    <p>Download links contain an unguessable random ID; anyone with the link can download the file until it expires, so do not share it. We do not sell your data.</p></section>);
}
export function Terms() {
  useTitle('Terms of Service');
  return (<section className="narrow prose"><h2>Terms of Service</h2>
    <p>The service is provided "as is". Conversion quality varies: PDF→Word and PDF→Excel rely on text extraction and may not preserve complex layouts; scanned PDFs are unsupported. Always check converted files.</p>
    <p>Do not upload unlawful content or files you have no right to process. We may limit usage to protect the service (rate limits, 20 MB per file).</p></section>);
}
export function NotFound() {
  useTitle('Page not found');
  return <section className="narrow" style={{ textAlign: 'center' }}><h1>404</h1><p>This page doesn't exist.</p><Link className="btn" to="/">Back to Home</Link></section>;
}
