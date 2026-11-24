export function newOrder(id = crypto.randomUUID()) {
  const start = new Date();
  start.setDate(start.getDate() + 2);
  const date = (offset, time) => {
    const value = new Date(start);
    value.setDate(value.getDate() + offset);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${time}`;
  };
  return {
    id, status: 'Draft', project: 'Untitled project', client: '', lines: [],
    manager: '', pickup: date(0, '19:00'), returns: date(2, '11:00'),
    discount: 0, deposit: 0, shiftsOverride: null, overrideReason: '', expires: null, note: '',
  };
}

export function seed() {
  const base = { ...newOrder('example'), manager: 'Konstantin A.', discount: 10 };
  return [
    {
      ...base, id: '3215', project: 'Music video · studio A', client: 'Northlight Production', status: 'Draft',
      lines: [
        { gearId: 'fx6', quantity: 2 }, { gearId: 'cooke', quantity: 1 },
        { gearId: 'battery130', quantity: 3 }, { gearId: 'sdi', quantity: 2 },
      ],
    },
    {
      ...base, id: '3214', project: 'Commercial · location shoot', client: 'Frame Studio', discount: 0, status: 'Warehouse Picking',
      lines: [{ gearId: 'fx6', quantity: 1 }, { gearId: 'battery130', quantity: 2 }],
    },
  ];
}
