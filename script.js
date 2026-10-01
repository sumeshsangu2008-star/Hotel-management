// ---------- Setup ----------
const STORE_KEY = 'marina_hotel_v1';
const $ = (s, r = document) => r.querySelector(s);

function defaultRooms() {
  const types = [
    { prefix: 1, type: 'Standard', price: 2500 },
    { prefix: 2, type: 'Deluxe',   price: 4000 },
    { prefix: 3, type: 'Suite',    price: 7500 },
  ];
  const rooms = [];
  types.forEach(t => {
    for (let i = 1; i <= 4; i++) {
      rooms.push({ number: t.prefix * 100 + i, type: t.type, price: t.price, status: 'available', bookingId: null });
    }
  });
  return rooms;
}

let state = load();
let filter = 'all';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && saved.rooms && saved.bookings) return saved;
  } catch {}
  return { rooms: defaultRooms(), bookings: [] };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// ---------- Helpers ----------
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const nightsBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Render ----------
function renderStats() {
  const total = state.rooms.length;
  const occupied = state.rooms.filter(r => r.status === 'occupied').length;
  const available = state.rooms.filter(r => r.status === 'available').length;
  const revenue = state.bookings.filter(b => b.status === 'Checked in').reduce((s, b) => s + b.total, 0);
  $('#statTotal').textContent = total;
  $('#statOccupied').textContent = occupied;
  $('#statAvailable').textContent = available;
  $('#statRevenue').textContent = money(revenue);
}

function renderRooms() {
  const list = state.rooms.filter(r => filter === 'all' || r.status === filter);
  $('#roomGrid').innerHTML = list.map(r => {
    const booking = state.bookings.find(b => b.id === r.bookingId);
    const guestLine = r.status === 'occupied' && booking ? esc(booking.guest) : '';
    let action = '';
    if (r.status === 'occupied') action = `<button class="btn btn-danger" data-checkout="${r.number}" type="button">Check out</button>`;
    if (r.status === 'cleaning') action = `<button class="btn btn-ghost" data-clean="${r.number}" type="button">Mark clean</button>`;
    return `
      <article class="room ${r.status}">
        <h3>${r.number}</h3>
        <span class="type">${r.type}</span>
        <span class="price">${money(r.price)} / night</span>
        <span class="guest">${guestLine}</span>
        <span class="badge ${r.status}">${r.status[0].toUpperCase() + r.status.slice(1)}</span>
        ${action}
      </article>`;
  }).join('') || '<p class="empty">No rooms match this filter.</p>';
}

function renderRoomSelect() {
  const sel = $('#bookingForm').elements.room;
  const keep = sel.value;
  const free = state.rooms.filter(r => r.status === 'available');
  sel.innerHTML = '<option value="">Select a room</option>' +
    free.map(r => `<option value="${r.number}">${r.number} · ${r.type} · ${money(r.price)}</option>`).join('');
  if (free.some(r => String(r.number) === keep)) sel.value = keep;
}

function renderBookings() {
  const rows = [...state.bookings].reverse().map(b => `
    <tr>
      <td>${b.id}</td>
      <td>${esc(b.guest)}<br><small>${b.phone}</small></td>
      <td>${b.room}</td>
      <td>${fmtDate(b.checkin)} to ${fmtDate(b.checkout)} (${b.nights}n)</td>
      <td>${money(b.total)}</td>
      <td class="${b.status === 'Checked in' ? 'status-active' : 'status-done'}">${b.status}</td>
      <td>${b.status === 'Checked in' ? `<button class="btn btn-ghost" data-checkout="${b.room}" type="button">Check out</button>` : '-'}</td>
    </tr>`).join('');
  $('#bookingBody').innerHTML = rows;
  $('#emptyMsg').hidden = state.bookings.length > 0;
}

function renderAll() {
  renderStats(); renderRooms(); renderRoomSelect(); renderBookings(); updateTotal();
  save();
}

// ---------- Booking form ----------
const form = $('#bookingForm');
form.elements.checkin.min = todayStr();
form.elements.checkout.min = todayStr();

function setError(el, msg) {
  const wrap = el.closest('.field');
  wrap.classList.toggle('invalid', !!msg);
  $('.error', wrap).textContent = msg || '';
}

function updateTotal() {
  const { room, checkin, checkout } = form.elements;
  const r = state.rooms.find(x => String(x.number) === room.value);
  const line = $('#totalLine');
  if (!r || !checkin.value || !checkout.value) { line.textContent = 'Select a room and dates to see the total.'; return; }
  const n = nightsBetween(checkin.value, checkout.value);
  if (n < 1) { line.textContent = 'Check-out must be after check-in.'; return; }
  line.textContent = `${n} night${n > 1 ? 's' : ''} × ${money(r.price)} = ${money(n * r.price)}`;
}

form.addEventListener('input', e => {
  if (e.target.name === 'phone') e.target.value = e.target.value.replace(/\D/g, '');
  if (e.target.name === 'checkin' && form.elements.checkout.value <= e.target.value) form.elements.checkout.value = '';
  if (e.target.name === 'checkin') form.elements.checkout.min = e.target.value || todayStr();
  setError(e.target, '');
  updateTotal();
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const f = form.elements;
  let ok = true;
  const check = (el, valid, msg) => { setError(el, valid ? '' : msg); if (!valid) ok = false; };

  check(f.guest, /^[A-Za-z .'-]{3,}$/.test(f.guest.value.trim()), 'Enter the guest name (letters only).');
  check(f.phone, /^[6-9]\d{9}$/.test(f.phone.value), 'Enter a 10-digit mobile number starting with 6-9.');
  check(f.room, !!f.room.value, 'Select an available room.');
  check(f.checkin, !!f.checkin.value && f.checkin.value >= todayStr(), 'Choose today or a later date.');
  check(f.checkout, !!f.checkout.value && f.checkout.value > f.checkin.value, 'Check-out must be after check-in.');
  check(f.guests, +f.guests.value >= 1 && +f.guests.value <= 4, 'Guests must be between 1 and 4.');
  if (!ok) return;

  const room = state.rooms.find(r => String(r.number) === f.room.value);
  const nights = nightsBetween(f.checkin.value, f.checkout.value);
  const id = 'BK' + String(state.bookings.length + 1001);

  state.bookings.push({
    id, guest: f.guest.value.trim(), phone: f.phone.value, room: room.number,
    checkin: f.checkin.value, checkout: f.checkout.value, guests: +f.guests.value,
    nights, total: nights * room.price, status: 'Checked in'
  });
  room.status = 'occupied';
  room.bookingId = id;

  form.reset();
  f.guests.value = 1;
  renderAll();
  toast(`Booking ${id} confirmed for room ${room.number}`);
});

// ---------- Actions ----------
document.addEventListener('click', e => {
  const out = e.target.closest('[data-checkout]');
  const clean = e.target.closest('[data-clean]');
  const chip = e.target.closest('.chip');

  if (out) {
    const room = state.rooms.find(r => String(r.number) === out.dataset.checkout);
    const booking = state.bookings.find(b => b.id === room.bookingId);
    if (booking) booking.status = 'Checked out';
    room.status = 'cleaning';
    room.bookingId = null;
    renderAll();
    toast(`Room ${room.number} checked out and sent for cleaning`);
  }
  if (clean) {
    const room = state.rooms.find(r => String(r.number) === clean.dataset.clean);
    room.status = 'available';
    renderAll();
    toast(`Room ${room.number} is ready`);
  }
  if (chip) {
    filter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    renderRooms();
  }
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Delete all bookings and reset every room?')) return;
  state = { rooms: defaultRooms(), bookings: [] };
  renderAll();
  toast('Demo data reset');
});

// ---------- Start ----------
renderAll();
