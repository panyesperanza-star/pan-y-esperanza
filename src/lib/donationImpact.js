export function buildDonationImpact(donation = {}, data = {}) {
  const rawDonation = donation.rawDonation || donation;
  const donationId = rawDonation.id || donation.donation_id || '';
  const products = donationProductsForDonation(rawDonation, data);
  const productIds = new Set(products.map((item) => item.id).filter(Boolean));
  const movements = (data.inventory_movements || []).filter((movement) => (
    movement.donation_id === donationId
    || productIds.has(movement.donation_product_id)
  ));
  const deliveredMovements = movements.filter((movement) => String(movement.movement_type || '').toLowerCase() === 'salida');
  const deliveriesById = new Map((data.deliveries || []).map((delivery) => [delivery.id, delivery]));
  const beneficiariesById = new Map((data.beneficiaries || []).map((beneficiary) => [beneficiary.id, beneficiary]));
  const familiesById = new Map((data.families || []).map((family) => [family.id, family]));
  const deliveryRows = [...new Map(deliveredMovements
    .map((movement) => deliveriesById.get(movement.delivery_id))
    .filter(Boolean)
    .map((delivery) => [delivery.id, delivery])
  ).values()];
  const familyKeys = new Set();
  let peopleBenefited = 0;

  deliveryRows.forEach((delivery) => {
    const familyKey = delivery.family_id || `beneficiary:${delivery.beneficiary_id || delivery.id}`;
    familyKeys.add(familyKey);
    peopleBenefited += peopleCountForDelivery(delivery, beneficiariesById, familiesById);
  });

  const productRows = products.map((product) => {
    const productMovements = movements.filter((movement) => (
      movement.donation_product_id === product.id
      || (!product.id && movement.donation_id === donationId)
    ));
    const delivered = productMovements
      .filter((movement) => String(movement.movement_type || '').toLowerCase() === 'salida')
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    const received = Number(product.quantity_received || product.quantity || 0);
    return {
      id: product.id || `${donationId}-${product.inventory_item_id || product.product_name}`,
      productName: product.product_name || product.name || rawDonation.donation_type || donation.concept || 'Donacion',
      received,
      delivered,
      remaining: Math.max(received - delivered, 0),
      unit: product.unit || rawDonation.unit || '',
      estimatedValue: Number(product.estimated_total_value || rawDonation.estimated_value || rawDonation.amount || donation.socialAmount || donation.moneyAmount || 0),
      lot: product.lot || '',
      date: product.received_at || rawDonation.donated_at || rawDonation.created_at || donation.date,
      deliveries: productMovements
        .map((movement) => deliveriesById.get(movement.delivery_id))
        .filter(Boolean)
    };
  });

  const monetaryValue = productRows.length
    ? productRows.reduce((sum, row) => sum + Number(row.estimatedValue || 0), 0)
    : Number(rawDonation.amount || rawDonation.estimated_value || donation.moneyAmount || donation.socialAmount || 0);

  return {
    donationId,
    receiptNumber: rawDonation.receipt_number || rawDonation.reference || donation.reference || '',
    products: productRows,
    unitsReceived: productRows.reduce((sum, row) => sum + Number(row.received || 0), 0),
    unitsDelivered: productRows.reduce((sum, row) => sum + Number(row.delivered || 0), 0),
    unitsRemaining: productRows.reduce((sum, row) => sum + Number(row.remaining || 0), 0),
    familiesBenefited: familyKeys.size,
    peopleBenefited,
    estimatedValue: monetaryValue,
    deliveries: deliveryRows
  };
}

export function buildDonorImpact(donor = {}, data = {}) {
  const donations = donor.donations || [];
  const impacts = donations.map((donation) => buildDonationImpact(donation, data));
  const deliveryIds = new Set();
  const familyKeys = new Set();
  const beneficiariesById = new Map((data.beneficiaries || []).map((beneficiary) => [beneficiary.id, beneficiary]));
  const familiesById = new Map((data.families || []).map((family) => [family.id, family]));
  let peopleBenefited = 0;

  impacts.flatMap((impact) => impact.deliveries).forEach((delivery) => {
    if (deliveryIds.has(delivery.id)) return;
    deliveryIds.add(delivery.id);
    familyKeys.add(delivery.family_id || `beneficiary:${delivery.beneficiary_id || delivery.id}`);
    peopleBenefited += peopleCountForDelivery(delivery, beneficiariesById, familiesById);
  });

  return {
    donations: impacts,
    unitsReceived: impacts.reduce((sum, impact) => sum + Number(impact.unitsReceived || 0), 0),
    unitsDelivered: impacts.reduce((sum, impact) => sum + Number(impact.unitsDelivered || 0), 0),
    unitsRemaining: impacts.reduce((sum, impact) => sum + Number(impact.unitsRemaining || 0), 0),
    estimatedValue: impacts.reduce((sum, impact) => sum + Number(impact.estimatedValue || 0), 0),
    familiesBenefited: familyKeys.size,
    peopleBenefited
  };
}

function donationProductsForDonation(donation = {}, data = {}) {
  const donationId = donation.id || donation.donation_id || '';
  const linked = (data.donation_products || []).filter((product) => product.donation_id === donationId);
  if (linked.length) return linked;
  if (donation.inventory_item_id || donation.quantity) {
    const item = (data.inventory_items || []).find((candidate) => candidate.id === donation.inventory_item_id) || {};
    return [{
      id: '',
      donation_id: donationId,
      inventory_item_id: donation.inventory_item_id,
      product_name: item.name || donation.donation_type || 'Producto donado',
      unit: item.unit || donation.unit || '',
      lot: item.lot || '',
      quantity_received: Number(donation.quantity || 0),
      estimated_total_value: Number(donation.estimated_value || donation.amount || 0),
      received_at: donation.donated_at || donation.created_at
    }];
  }
  return [];
}

function peopleCountForDelivery(delivery, beneficiariesById, familiesById) {
  const family = familiesById.get(delivery.family_id);
  if (family) return Math.max(1, Number(family.dependents_count || 0) + 1);
  const beneficiary = beneficiariesById.get(delivery.beneficiary_id);
  return Math.max(1, Number(beneficiary?.family_members || beneficiary?.household_size || 1));
}
