import { useState, useEffect } from 'react';
import { getFacturesMois } from '../services/facturesMoisService';

export function useBadges() {
  const [tenantsBadge, setTenantsBadge] = useState(0);
  const [invoicesBadge, setInvoicesBadge] = useState(0);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const factures = await getFacturesMois(now.getMonth() + 1, now.getFullYear());
      const enRetard = factures.filter((f) => f.status === 'En retard').length;
      const enAttente = factures.filter((f) => f.status === 'En attente').length;
      setTenantsBadge(enRetard);
      setInvoicesBadge(enRetard + enAttente);
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return { tenantsBadge, invoicesBadge };
}
