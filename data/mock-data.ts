import type { Customer, DealerApplication, Order, Product, ServiceBooking } from '@/types'

export const demoProducts: Product[] = [
  { id: 'AP-PUR-001', name: 'AquaPure Nova RO+UV', category: 'Purifiers', price: 18499, stock: 24, image: '/placeholder.jpg', status: 'In stock' },
  { id: 'AP-PUR-002', name: 'AquaPure Wave Alkaline', category: 'Purifiers', price: 22999, stock: 8, image: '/placeholder.jpg', status: 'Low stock' },
  { id: 'AP-FLT-014', name: 'Sediment Filter 10 inch', category: 'Filters', price: 349, stock: 142, image: '/placeholder.jpg', status: 'In stock' },
  { id: 'AP-MEM-022', name: 'RO Membrane 75 GPD', category: 'Membranes', price: 899, stock: 31, image: '/placeholder.jpg', status: 'In stock' },
  { id: 'AP-DSP-005', name: 'PureFlow Tabletop Dispenser', category: 'Dispensers', price: 6799, stock: 0, image: '/placeholder.jpg', status: 'Out of stock' },
  { id: 'AP-PMP-009', name: 'Booster Pump 100 GPD', category: 'Pumps', price: 1249, stock: 17, image: '/placeholder.jpg', status: 'In stock' },
]

export const demoCustomers: Customer[] = [
  { id: 'CUS-1024', name: 'Ananya Sharma', email: 'ananya.sharma@email.com', phone: '+91 98765 43210', registered: '12 Sep 2024', address: 'Banjara Hills, Hyderabad' },
  { id: 'CUS-1025', name: 'Rohan Mehta', email: 'rohan.mehta@email.com', phone: '+91 98111 22334', registered: '18 Sep 2024', address: 'Koramangala, Bengaluru' },
  { id: 'CUS-1026', name: 'Priya Nair', email: 'priya.nair@email.com', phone: '+91 99887 66554', registered: '24 Sep 2024', address: 'Andheri West, Mumbai' },
  { id: 'CUS-1027', name: 'Vikram Singh', email: 'vikram.singh@email.com', phone: '+91 97654 32109', registered: '02 Oct 2024', address: 'Gurugram, Haryana' },
]

export const demoOrders: Order[] = [
  { id: 'AP-24091', customerId: 'CUS-1024', customer: 'Ananya Sharma', date: '24 Oct 2024', total: 18499, payment: 'Paid', status: 'Processing', address: 'Banjara Hills, Hyderabad', items: [{ productId: 'AP-PUR-001', name: 'AquaPure Nova RO+UV', quantity: 1, price: 18499 }] },
  { id: 'AP-24090', customerId: 'CUS-1025', customer: 'Rohan Mehta', date: '23 Oct 2024', total: 1249, payment: 'Paid', status: 'Shipped', address: 'Koramangala, Bengaluru', items: [{ productId: 'AP-PMP-009', name: 'Booster Pump 100 GPD', quantity: 1, price: 1249 }] },
  { id: 'AP-24089', customerId: 'CUS-1026', customer: 'Priya Nair', date: '22 Oct 2024', total: 22999, payment: 'Pending', status: 'Pending', address: 'Andheri West, Mumbai', items: [{ productId: 'AP-PUR-002', name: 'AquaPure Wave Alkaline', quantity: 1, price: 22999 }] },
  { id: 'AP-24088', customerId: 'CUS-1027', customer: 'Vikram Singh', date: '21 Oct 2024', total: 1598, payment: 'Paid', status: 'Delivered', address: 'Gurugram, Haryana', items: [{ productId: 'AP-FLT-014', name: 'Sediment Filter 10 inch', quantity: 2, price: 349 }, { productId: 'AP-MEM-022', name: 'RO Membrane 75 GPD', quantity: 1, price: 899 }] },
]

export const demoDealers: DealerApplication[] = [
  { id: 'DLR-0084', business: 'ClearWater Solutions', contact: 'Arjun Rao', email: 'arjun@clearwater.in', date: '24 Oct 2024', status: 'Pending', city: 'Pune', notes: 'Looking to serve residential communities.' },
  { id: 'DLR-0083', business: 'BlueDrop Services', contact: 'Meera Shah', email: 'meera@bluedrop.in', date: '22 Oct 2024', status: 'Pending', city: 'Ahmedabad', notes: 'Existing appliance service network.' },
  { id: 'DLR-0082', business: 'HydroCare Retail', contact: 'Nikhil Verma', email: 'nikhil@hydrocare.in', date: '18 Oct 2024', status: 'Approved', city: 'Jaipur', notes: 'Multi-brand water solutions retailer.' },
]

export const demoServices: ServiceBooking[] = [
  { id: 'SRV-5019', customer: 'Ananya Sharma', phone: '+91 98765 43210', type: 'Installation', address: 'Banjara Hills, Hyderabad', date: '26 Oct 2024', time: '10:00 AM', status: 'Scheduled' },
  { id: 'SRV-5018', customer: 'Rohan Mehta', phone: '+91 98111 22334', type: 'Filter replacement', address: 'Koramangala, Bengaluru', date: '25 Oct 2024', time: '02:30 PM', status: 'Requested' },
  { id: 'SRV-5017', customer: 'Priya Nair', phone: '+91 99887 66554', type: 'Annual maintenance', address: 'Andheri West, Mumbai', date: '24 Oct 2024', time: '11:00 AM', status: 'Completed' },
]
