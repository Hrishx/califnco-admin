export type ProductCategory = 'Purifiers' | 'Dispensers' | 'Pumps' | 'Filters' | 'Membranes' | 'Cartridges' | 'Spare parts'
export type ProductStatus = 'In stock' | 'Low stock' | 'Out of stock'
export type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'
export type PaymentStatus = 'Paid' | 'Pending' | 'Refunded'
export type ApplicationStatus = 'Pending' | 'Approved' | 'Rejected'
export type BookingStatus = 'Requested' | 'Scheduled' | 'In progress' | 'Completed' | 'Cancelled'

export type Product = { id: string; name: string; category: ProductCategory; price: number; stock: number; image: string; status: ProductStatus }
export type OrderItem = { productId: string; name: string; quantity: number; price: number }
export type Order = { id: string; customerId: string; customer: string; date: string; total: number; payment: PaymentStatus; status: OrderStatus; address: string; items: OrderItem[] }
export type Customer = { id: string; name: string; email: string; phone: string; registered: string; address: string }
export type DealerApplication = { id: string; business: string; contact: string; email: string; date: string; status: ApplicationStatus; city: string; notes: string }
export type ServiceBooking = { id: string; customer: string; phone: string; type: string; address: string; date: string; time: string; status: BookingStatus }
