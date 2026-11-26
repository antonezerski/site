const orders = [
  ['4081', 'Warehouse Picking', 'Bramble Film & Television', 'Autumn Campaign', '25 Nov · 16:25', '26 Nov · 18:00'],
  ['4080', 'Awaiting Payment', 'Harborline Studio', 'Winter Lookbook', '27 Nov · 09:00', '28 Nov · 17:30'],
  ['4079', 'Ready for Pickup', 'Juniper Works', 'Product Launch', '26 Nov · 08:30', '27 Nov · 19:00'],
  ['4078', 'Draft', 'Morrow Pictures', 'Night Exterior', '30 Nov · 17:00', '2 Dec · 11:00'],
  ['4077', 'On Rent', 'Lowfield Media', 'Behind the Scenes', '24 Nov · 07:30', '27 Nov · 18:30'],
  ['4076', 'Return Inspection', 'Copper Kite Films', 'Studio Interviews', '23 Nov · 10:00', '25 Nov · 16:00'],
  ['4075', 'Closed', 'Marshlight Studio', 'Café Portraits', '21 Nov · 09:00', '22 Nov · 15:00'],
  ['4074', 'Warehouse Picking', 'Ridgeline Motion', 'Train Depot Night Exterior', '27 Nov · 06:30', '28 Nov · 18:00'],
  ['4073', 'Draft', 'Orchard Post', 'Live Session', '3 Dec · 12:00', '4 Dec · 12:00'],
  ['4072', 'Awaiting Payment', 'Kestrel Collective', 'Fragrance Spot', '29 Nov · 15:00', '1 Dec · 10:00'],
  ['4071', 'Ready for Pickup', 'Silt House Films', 'Workshop Profile', '28 Nov · 08:00', '29 Nov · 17:00'],
  ['4070', 'On Rent', 'Alder & Ash', 'Homeware Stills', '25 Nov · 11:00', '27 Nov · 14:00'],
  ['4069', 'Canceled', 'Westmere Creative', 'Mountain B-Roll', '26 Nov · 05:30', '28 Nov · 19:00'],
  ['4068', 'Closed', 'Paper Finch Studio', 'Dance Rehearsal', '19 Nov · 13:30', '20 Nov · 11:00'],
  ['4067', 'Settlement', 'Fallow Road Film Collective', 'Rain Unit', '20 Nov · 16:00', '22 Nov · 18:00'],
  ['4066', 'Draft', 'Driftwood Media', 'Documentary Pickup', '5 Dec · 07:00', '7 Dec · 17:00'],
  ['4065', 'Closed', 'Tern Avenue', 'Chef Portraits', '18 Nov · 08:00', '19 Nov · 16:30'],
];

const orderList = document.querySelector('#orders-list');
const rowTemplate = document.querySelector('#order-row');

for (const [index, order] of orders.entries()) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  for (const [column, value] of row.querySelectorAll('.order-value').entries()) {
    value.textContent = order[column];
    value.title = order[column];
  }
  if (index < 2) {
    row.classList.add('selected-order');
    row.cells[0].setAttribute('aria-label', 'Selected');
  }
  orderList.append(row);
}
document.querySelector('#order-title').textContent = '№ ' + orders[0][0];

await document.fonts.ready;
for (const value of orderList.querySelectorAll('.name-cell .order-value')) {
  if (value.scrollWidth <= value.clientWidth) continue;
  const fullName = value.textContent;
  let shortened = fullName;
  do {
    shortened = shortened.slice(0, -1).trimEnd();
    value.textContent = shortened + '..';
  } while (shortened && value.scrollWidth > value.clientWidth);
  value.closest('td').setAttribute('aria-label', fullName);
}
