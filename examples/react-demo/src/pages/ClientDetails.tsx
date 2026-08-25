import { Link, useParams } from 'react-router-dom';
import { findClient } from '../data/clients';

export function ClientDetails() {
  const { clientId } = useParams();
  const client = clientId ? findClient(clientId) : undefined;

  if (!client) {
    return (
      <main data-guide="clients.detail.missing" data-guide-type="section">
        <h2>Client not found</h2>
        <p className="lede">
          <Link to="/clients">Back to clients</Link>
        </p>
      </main>
    );
  }

  return (
    <main data-guide="clients.detail" data-guide-type="section">
      <h2>{client.name}</h2>
      <p className="lede">
        {client.industry} · {client.status}
      </p>

      <section>
        <h3>Details</h3>
        <table data-guide="clients.detail.table" data-guide-label="Client details">
          <tbody>
            <tr>
              <th>Owner</th>
              <td>{client.owner}</td>
            </tr>
            <tr>
              <th>Industry</th>
              <td>{client.industry}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>{client.status}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <div className="row-actions">
          <button data-guide="clients.detail.edit">Edit client</button>
          <Link to="/clients" data-guide="clients.detail.back" data-guide-type="link">
            Back to clients
          </Link>
        </div>
      </section>
    </main>
  );
}
