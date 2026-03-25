/**
 * Sprint 6 — Order History, Profile, Notifications
 * Pure logic tests — no React rendering, no network
 */

// ─── Order History helpers ─────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['pending', 'matched', 'pickup_en_route', 'arrived_pickup', 'in_transit', 'arrived_dropoff'];
const COMPLETED_STATUSES = ['delivered', 'completed'];
const CANCELLED_STATUSES = ['cancelled'];

type OrderFilter = 'all' | 'active' | 'completed' | 'cancelled';

type Order = { id: string; status: string; created_at: string };

function filterOrders(orders: Order[], filter: OrderFilter): Order[] {
  switch (filter) {
    case 'active':    return orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    case 'completed': return orders.filter((o) => COMPLETED_STATUSES.includes(o.status));
    case 'cancelled': return orders.filter((o) => CANCELLED_STATUSES.includes(o.status));
    default:          return orders;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':          return 'Finding Rider';
    case 'matched':          return 'Rider Assigned';
    case 'pickup_en_route':  return 'Heading to Pickup';
    case 'arrived_pickup':   return 'At Pickup';
    case 'in_transit':       return 'In Transit';
    case 'arrived_dropoff':  return 'At Dropoff';
    case 'delivered':
    case 'completed':        return 'Delivered';
    case 'cancelled':        return 'Cancelled';
    default:                 return status;
  }
}

function statusColor(status: string): string {
  if (COMPLETED_STATUSES.includes(status)) return '#16A34A';
  if (CANCELLED_STATUSES.includes(status)) return '#ba1a1a';
  if (ACTIVE_STATUSES.includes(status)) return '#0040e0';
  return '#74777e';
}

function shortAddress(addr: string): string {
  return addr.split(',')[0] ?? addr;
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

// ─── Order Details helpers ─────────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'pending',         label: 'Order Placed' },
  { key: 'matched',         label: 'Rider Assigned' },
  { key: 'pickup_en_route', label: 'Heading to Pickup' },
  { key: 'in_transit',      label: 'In Transit' },
  { key: 'delivered',       label: 'Delivered' },
];

function statusStepIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  if (['arrived_pickup', 'in_transit', 'arrived_dropoff'].includes(status)) return 3;
  if (['delivered', 'completed'].includes(status)) return 4;
  return 0;
}

// ─── Notifications helpers ─────────────────────────────────────────────────────

type NotifType = 'order_update' | 'promo' | 'system' | 'payment';
type Notif = { id: string; type: NotifType; is_read: boolean; created_at: string };

function notifIcon(type: NotifType): string {
  switch (type) {
    case 'order_update': return '🚚';
    case 'payment':      return '💳';
    case 'promo':        return '🎁';
    case 'system':       return 'ℹ';
    default:             return '🔔';
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function groupNotifications(notifs: Notif[]) {
  return {
    orderUpdates: notifs.filter((n) => n.type === 'order_update' || n.type === 'payment'),
    promos: notifs.filter((n) => n.type === 'promo'),
    system: notifs.filter((n) => n.type === 'system'),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sprint 6 — Order History', () => {

  const orders: Order[] = [
    { id: '1', status: 'pending', created_at: new Date().toISOString() },
    { id: '2', status: 'in_transit', created_at: new Date().toISOString() },
    { id: '3', status: 'delivered', created_at: new Date().toISOString() },
    { id: '4', status: 'completed', created_at: new Date().toISOString() },
    { id: '5', status: 'cancelled', created_at: new Date().toISOString() },
    { id: '6', status: 'matched', created_at: new Date().toISOString() },
    { id: '7', status: 'arrived_pickup', created_at: new Date().toISOString() },
  ];

  describe('filterOrders()', () => {
    it('returns all orders for "all" filter', () => {
      expect(filterOrders(orders, 'all')).toHaveLength(7);
    });

    it('returns only active orders', () => {
      const result = filterOrders(orders, 'active');
      expect(result.length).toBeGreaterThan(0);
      result.forEach((o) => expect(ACTIVE_STATUSES).toContain(o.status));
    });

    it('returns only completed orders', () => {
      const result = filterOrders(orders, 'completed');
      expect(result).toHaveLength(2); // delivered + completed
      result.forEach((o) => expect(COMPLETED_STATUSES).toContain(o.status));
    });

    it('returns only cancelled orders', () => {
      const result = filterOrders(orders, 'cancelled');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('cancelled');
    });

    it('returns empty for filter with no matches', () => {
      expect(filterOrders([], 'active')).toHaveLength(0);
    });
  });

  describe('statusLabel()', () => {
    it('maps known statuses correctly', () => {
      expect(statusLabel('pending')).toBe('Finding Rider');
      expect(statusLabel('matched')).toBe('Rider Assigned');
      expect(statusLabel('in_transit')).toBe('In Transit');
      expect(statusLabel('delivered')).toBe('Delivered');
      expect(statusLabel('completed')).toBe('Delivered');
      expect(statusLabel('cancelled')).toBe('Cancelled');
    });

    it('returns raw status for unknown values', () => {
      expect(statusLabel('unknown_status')).toBe('unknown_status');
    });
  });

  describe('statusColor()', () => {
    it('returns green for completed', () => {
      expect(statusColor('delivered')).toBe('#16A34A');
      expect(statusColor('completed')).toBe('#16A34A');
    });

    it('returns red for cancelled', () => {
      expect(statusColor('cancelled')).toBe('#ba1a1a');
    });

    it('returns blue for active', () => {
      expect(statusColor('in_transit')).toBe('#0040e0');
      expect(statusColor('pending')).toBe('#0040e0');
    });
  });

  describe('shortAddress()', () => {
    it('returns the first part before the comma', () => {
      expect(shortAddress('123 Victoria Island, Lagos, Nigeria')).toBe('123 Victoria Island');
    });

    it('returns full string if no comma', () => {
      expect(shortAddress('Victoria Island')).toBe('Victoria Island');
    });
  });

  describe('formatRelativeDate()', () => {
    it('shows minutes ago for recent times', () => {
      const recent = new Date(Date.now() - 5 * 60000).toISOString();
      expect(formatRelativeDate(recent)).toBe('5m ago');
    });

    it('shows hours ago for same-day times', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
      expect(formatRelativeDate(threeHoursAgo)).toBe('3h ago');
    });

    it('shows Yesterday for previous day', () => {
      const yesterday = new Date(Date.now() - 25 * 3600000).toISOString();
      expect(formatRelativeDate(yesterday)).toBe('Yesterday');
    });
  });
});

// ─── Sprint 6 — Order Details ─────────────────────────────────────────────────

describe('Sprint 6 — Order Details', () => {

  describe('statusStepIndex()', () => {
    it('returns 0 for pending', () => {
      expect(statusStepIndex('pending')).toBe(0);
    });

    it('returns 1 for matched', () => {
      expect(statusStepIndex('matched')).toBe(1);
    });

    it('returns 3 for in_transit and arrived variants', () => {
      expect(statusStepIndex('in_transit')).toBe(3);
      expect(statusStepIndex('arrived_pickup')).toBe(3);
      expect(statusStepIndex('arrived_dropoff')).toBe(3);
    });

    it('returns 4 for delivered and completed', () => {
      expect(statusStepIndex('delivered')).toBe(4);
      expect(statusStepIndex('completed')).toBe(4);
    });

    it('returns 0 for unknown status', () => {
      expect(statusStepIndex('unknown')).toBe(0);
    });
  });

  describe('STATUS_STEPS', () => {
    it('has exactly 5 steps', () => {
      expect(STATUS_STEPS).toHaveLength(5);
    });

    it('starts with order placed and ends with delivered', () => {
      expect(STATUS_STEPS[0].label).toBe('Order Placed');
      expect(STATUS_STEPS[4].label).toBe('Delivered');
    });
  });

  describe('order ID formatting', () => {
    it('generates 6-char uppercase suffix', () => {
      const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const formatted = '#' + orderId.slice(-6).toUpperCase();
      expect(formatted).toBe('#567890');
      expect(formatted.length).toBe(7); // # + 6 chars
    });
  });
});

// ─── Sprint 6 — Notifications ─────────────────────────────────────────────────

describe('Sprint 6 — Notifications', () => {

  const notifs: Notif[] = [
    { id: '1', type: 'order_update', is_read: false, created_at: new Date().toISOString() },
    { id: '2', type: 'payment',      is_read: true,  created_at: new Date().toISOString() },
    { id: '3', type: 'promo',        is_read: false, created_at: new Date().toISOString() },
    { id: '4', type: 'promo',        is_read: true,  created_at: new Date().toISOString() },
    { id: '5', type: 'system',       is_read: true,  created_at: new Date().toISOString() },
    { id: '6', type: 'system',       is_read: false, created_at: new Date().toISOString() },
  ];

  describe('groupNotifications()', () => {
    it('groups order_update and payment together', () => {
      const groups = groupNotifications(notifs);
      expect(groups.orderUpdates).toHaveLength(2);
      groups.orderUpdates.forEach((n) =>
        expect(['order_update', 'payment']).toContain(n.type)
      );
    });

    it('groups promos separately', () => {
      const groups = groupNotifications(notifs);
      expect(groups.promos).toHaveLength(2);
      groups.promos.forEach((n) => expect(n.type).toBe('promo'));
    });

    it('groups system messages separately', () => {
      const groups = groupNotifications(notifs);
      expect(groups.system).toHaveLength(2);
      groups.system.forEach((n) => expect(n.type).toBe('system'));
    });
  });

  describe('unread count', () => {
    it('correctly counts unread notifications', () => {
      const unread = notifs.filter((n) => !n.is_read).length;
      expect(unread).toBe(3); // ids 1, 3, 6
    });

    it('returns 0 when all are read', () => {
      const allRead = notifs.map((n) => ({ ...n, is_read: true }));
      expect(allRead.filter((n) => !n.is_read).length).toBe(0);
    });
  });

  describe('mark all read', () => {
    it('sets all is_read to true', () => {
      const updated = notifs.map((n) => ({ ...n, is_read: true }));
      expect(updated.every((n) => n.is_read)).toBe(true);
    });
  });

  describe('notifIcon()', () => {
    it('returns correct icons for each type', () => {
      expect(notifIcon('order_update')).toBe('🚚');
      expect(notifIcon('payment')).toBe('💳');
      expect(notifIcon('promo')).toBe('🎁');
      expect(notifIcon('system')).toBe('ℹ');
    });
  });

  describe('relativeTime()', () => {
    it('shows minutes for very recent', () => {
      const iso = new Date(Date.now() - 2 * 60000).toISOString();
      expect(relativeTime(iso)).toBe('2m ago');
    });

    it('shows hours for same day', () => {
      const iso = new Date(Date.now() - 5 * 3600000).toISOString();
      expect(relativeTime(iso)).toBe('5h ago');
    });

    it('shows Yesterday for prior day', () => {
      const iso = new Date(Date.now() - 25 * 3600000).toISOString();
      expect(relativeTime(iso)).toBe('Yesterday');
    });
  });
});

// ─── Sprint 6 — Profile helpers ──────────────────────────────────────────────

describe('Sprint 6 — Profile', () => {

  describe('initials generation', () => {
    function getInitials(fullName: string): string {
      return fullName
        .split(' ')
        .map((w) => w.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }

    it('extracts first two initials', () => {
      expect(getInitials('John Doe')).toBe('JD');
      expect(getInitials('Alice Bob Carter')).toBe('AB');
    });

    it('handles single name', () => {
      expect(getInitials('Alice')).toBe('A');
    });

    it('uppercases initials', () => {
      expect(getInitials('john doe')).toBe('JD');
    });
  });

  describe('KYC badge', () => {
    function kycLabel(status: string | null | undefined): string {
      return status === 'approved' ? '✓  Verified' : '⏳  KYC Pending';
    }

    it('shows Verified for approved status', () => {
      expect(kycLabel('approved')).toBe('✓  Verified');
    });

    it('shows KYC Pending for other statuses', () => {
      expect(kycLabel('pending')).toBe('⏳  KYC Pending');
      expect(kycLabel(null)).toBe('⏳  KYC Pending');
      expect(kycLabel(undefined)).toBe('⏳  KYC Pending');
      expect(kycLabel('rejected')).toBe('⏳  KYC Pending');
    });
  });
});
