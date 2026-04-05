# Customer App - UI/UX Redesign

## Phase 2: Screen Details & Interactions

### 1. Splash Screen
- **Visuals:** App Logo, Brand Colors, Loading Animation.
- **Interactions:** Auto-transitions to Onboarding (if first time) or Home/Auth (if returning user).

### 2. Onboarding / Walkthrough
- **Elements:** Carousel/Slider with 3-4 slides explaining app benefits (e.g., Fast Delivery, Secure Payments, Real-time Tracking).
- **Interactions:** Swipe left/right between slides.
- **Buttons:** 
  - `Skip` (jumps straight to Auth)
  - `Next` (moves to the next slide)
  - `Get Started` (on the last slide, goes to Auth)

### 3. Authentication
- **Login / Sign Up:**
  - **Inputs:** Phone number or Email, Password.
  - **Buttons:** `Login`, `Sign Up`, `Forgot Password?`, `Continue with Google/Apple` (Social Logins).
- **OTP Verification:**
  - **Inputs:** 4-6 digit code input fields (auto-focus next input).
  - **Buttons:** `Verify Code`, `Resend Code` (active after countdown timer ends).

### 4. Password Recovery Flow
- **Forgot Password:**
  - **Inputs:** Registered Email or Phone number.
  - **Buttons:** `Send Reset Link / OTP`.
- **Reset Password:**
  - **Inputs:** OTP/Code field, New Password, Confirm New Password.
  - **Buttons:** `Update Password`.
- **Reset Success:**
  - **Elements:** Success illustration, confirmation text.
  - **Buttons:** `Back to Login`.

### 5. Home / Dashboard
- **Elements:** 
  - User greeting & Profile picture avatar.
  - Current location display (auto-detected via GPS) with location icon.
  - Large decorative central visual (e.g., Gift/Package icon).
  - Main Action Card: 'Send a Package' with search icon and arrow.
  - Active Deliveries Section (Conditional):
    - Shows list of currently active orders.
    - Status pills (e.g., 'Finding Rider', 'Heading to You').
    - Rider Profile Info (Avatar, Name, Rating, Vehicle Model).
    - Pick-up and Drop-off address display.
    - Visual progress bar/tracker with icons.
  - Global Search Overlay/Modal.
  - Cancel Order Modal (Conditional for pending orders):
    - List of cancellation reasons (radio buttons).
- **Interactions:** 
  - Scrollable view for when multiple active orders exist.
  - Tap active order to navigate to specific tracking screen.
- **Buttons:**
  - `Send a Package` (Main CTA).
  - `Cancel Order` (on active order card).
  - `Confirm Cancellation` (inside cancel modal).

### 6. Create Order (Unified Form)
- **Elements:**
  - "FROM" and "TO" address search inputs.
  - Autocomplete dropdown overlay for address suggestions (Current location, Recent history).
  - Recipient Name & Phone Number fields.
  - Package Type selector (Food, Documents, Parcel, etc.).
  - Package Size selector (Small, Medium, Large).
  - "Require Delivery Code" toggle switch.
  - Promo Code input field.
  - Pricing Summary (dynamically visible once details are filled): Delivery Fee, Service & Tax, Total.
- **Buttons:**
  - `Clear` (Address inputs).
  - `Apply Promo Code`.
  - `Find Rider - ₦[Price]` (Proceeds directly to finding rider).

### 7. Bid & Negotiation Flow
- **Elements:**
  - **Live Bidding Pool:** Screen displaying incoming offers from nearby riders in real-time.
  - **Rider Offer Cards:** Each card shows Rider Name, Avatar, Star Rating, Vehicle Type, Distance/ETA, and their **Bid Amount**.
  - **Counter-Offer Modal:** A numeric input field allowing the customer to suggest a different price.
  - **Timer:** A countdown showing how long a bid or counter-offer remains valid before expiring.
- **Interactions:**
  - Customer can review multiple bids simultaneously.
  - Customer can accept a bid directly or initiate a negotiation by sending a counter-offer.
  - If a counter-offer is sent, the UI enters a 'Waiting for Rider Response' state.
- **Buttons:**
  - `Accept Offer` (Locks in the rider and proceeds to active order tracking).
  - `Negotiate / Counter` (Opens the counter-offer modal).
  - `Decline` (Removes the rider's bid from the list).
  - `Submit Counter-Offer` (Inside the modal).

### 8. Direct Merchant Booking
- **Elements:**
  - Security header ("DZPatch").
  - Merchant identity card (Logo, Name).
  - "Amount to Pay" numeric input (editable or locked).
  - "Delivery Address" input field.
  - "Note / Item Description" input field.
  - "Your Email" input field (for receipt).
  - Order total display.
  - Success screen (shown post-payment) with "Track Delivery Live" upsell.
- **Buttons:**
  - `Pay` (initiates Paystack gateway).
  - `Download App & Track` (on success screen).

### 9. Active Order Tracking (Map & Status)
- **Elements:**
  - Live interactive map showing driver icon moving.
  - Order status timeline (e.g., Rider assigned -> Heading to pick-up -> Picked up -> On the way -> Delivered).
  - Rider details card (Photo, Name, Vehicle Plate, Rating, Vehicle Model).
  - ETA and Distance remaining.
- **Buttons:**
  - `Call Rider` (Triggers native phone dialer overlay).
  - `Chat with Rider` (Navigates to In-App Chat screen).
  - `Cancel Order` (conditional, usually available before pick-up).
  - `Share Tracking Link`.

### 9b. In-App Chat (Customer <-> Rider)
- **Elements:**
  - Header with Rider Name, Photo, and 'Active Order' status pill.
  - Scrollable chat history (message bubbles).
  - Timestamp for each message.
  - 'Read/Delivered' receipt indicators.
  - Text input field at the bottom.
- **Buttons:**
  - `Back` (returns to tracking screen).
  - `Call` icon (in header, quick dial).
  - `Send` (paper plane icon).
  - `Attach Image` (optional, camera/gallery icon).

### 10. Order History (List & Details)
- **Main List View (Orders Tab):**
  - **Elements:**
    - Search bar (Search by ID, location, date).
    - List of Order Cards. Each card shows: Status badge (color-coded), Date, Pickup & Dropoff addresses (with visual timeline dots), Order ID, and Price.
    - Empty state view ('No orders yet').
    - 'Business Insights' upsell banner at the bottom.
  - **Interactions:** Infinite scroll (load more), tap card to view details.

- **Order Details View:**
  - **Elements:**
    - Status Banner (Icon, Title like 'Order Delivered', Date/Time).
    - Rider Details Card (Avatar, Name, Vehicle Type/Model).
    - Route Card (Pickup and Dropoff timeline).
    - Payment Breakdown (Total Amount, Payment Method).
    - Dispute Modal (Category selector, Description input) for completed orders.
    - Cancellation Modal (Reasons list) for pending orders.
  - **Buttons:**
    - `Call Driver` / `Text Driver`.
    - `Track Order & View Code` (if active).
    - `Cancel Order` (if pending).
    - `Report a Dispute` (if completed).

### 11. Customer Analytics / Stats (Business Insights)
- **Upsell State (For regular users):**
  - **Elements:** Lock/Chart icon, Value proposition text.
  - **Features Listed:** Detailed Spending Graphs, Export Transactions to CSV, Search Order History.
  - **Buttons:** `Switch to Business Account`.
- **Main Analytics View (For business users):**
  - **Elements:**
    - Period Selector toggle (Week / Month / Year).
    - Summary Stats Cards (Total Spent, Total Orders, Average Per Order).
    - Interactive Bar Chart ('Spending by Day' or selected period).
    - 'Quick Insights' cards (Text-based summary of the data).
  - **Interactions:** Tap period toggles to refresh chart data.

### 12. Delivery Lifecycle States (Tracking & Status)
- **Searching State (Finding Rider):**
  - **Elements:**
    - Radar/Pulse animation on map with 'Riders viewed' counter.
    - Searching progress bar with stage indicators (e.g., 'Expanding search area').
    - Staged timer showing elapsed search time.
    - **Offer List:** Cards for riders who bid on the delivery (Photo, Name, Rating, Trips, Vehicle, Bid Price).
    - **No Riders Found State:** Timeout screen with 'Try Again' or 'Adjust Price' options.
  - **Buttons:** `Accept Offer`, `Decline Offer`, `Adjust Price`, `Cancel Request`.

- **Active Tracking States:**
  - **Rider Accepted:** Card showing assigned rider info and estimated arrival time.
  - **At Pickup:** Banner/Notification indicating the rider has arrived at the pickup location.
  - **Picked Up / In Transit:** Map shows rider movement with a 'Delivery in Progress' status.
  - **Elements:** Live route line (Polyline), ETA in minutes, Real-time distance.
  - **Buttons:** `Call Rider`, `Chat`, `SOS`, `Cancel Delivery` (if applicable).

- **Completion Screen (Delivery Success):**
  - **Elements:**
    - Celebration/Confetti animation overlay.
    - Large 'Delivery Completed!' title with Order ID.
    - Summary of the delivery (Rider info, final price).
    - Backdrop map with a final delivery pin.
  - **Buttons:** `Rate Rider`, `Report an Issue`, `Done / Back to Home`.

### 13. Driver Rating & Review
- **Elements:**
  - Star Rating component (1-5 clickable stars).
  - Feedback Tags (e.g., 'Polite', 'Fast Delivery', 'Careful Handling').
  - Multi-line text input for custom comments.
  - **Issue Reporting Modal:**
    - Category selection (e.g., 'Late Delivery', 'Damaged Package').
    - Description box for details.
- **Buttons:** `Submit Review`, `Skip Feedback`, `Submit Issue`.
- **Elements:** User details summary (Name, Email, Phone).
- **List items navigating to:** Address Management, Wallet, Account Management, Notifications Preferences, Support.
- **Buttons:** `Edit Profile`, `Logout`.

### 14. Notifications
- **Elements:** List of notifications (Promo alerts, Order updates, System messages) with Unread indicators.
- **Interactions:** Swipe left to delete, Tap to open details.
- **Buttons:** `Mark all as read`.

### 15. Customer Support / Chat
- **Elements:** 
  - FAQ categories / Help articles.
  - Live chat interface (Messages list, text input box).
- **Buttons:** `Send Message`, `Call Support`, `Attach File` (camera/gallery icon for screenshots).

### 16. Address Management
- **Elements:** List of saved locations (Home, Work, Others).
- **Address Search/Confirm:** Search bar, map pin drop.
- **Buttons:** `Add New Address`, `Edit Address`, `Delete Address`, `Save Location`.

### 17. Wallet System
- **Elements:** Current Balance display prominently, Recent transactions list (debits/credits).
- **Buttons:**
  - `Fund Wallet` (opens payment gateway).
  - `Withdraw` (if applicable).
  - Filters (by date or transaction type).

### 18. Matching & Tracking States
- **"Finding Rider" State:** 
  - Radar/Pulse animation on map.
  - Searching text/loading indicator.
  - **Buttons:** `Cancel Search`.
- **"Delivery Success" Confirmation:**
  - Success illustration/animation.
  - Final price paid & Delivery time.
  - View digital receipt.
  - **Buttons:** `Rate Rider` (leads to screen 12), `Done / Back to Home`.

### 19. Account Management
- **Elements:** 
  - KYC / Upload ID forms (File upload dropzone or camera integration).
  - Invite/Referrals (Referral code display, total earned stats).
  - Privacy & Security settings toggles.
- **Buttons:** `Upload Document`, `Copy/Share Referral Code`, `Change Password`, `Delete Account` (triggers a confirmation modal).

### 20. Global System States (UI Overlays)
- **Offline Banner:**
  - **Elements:** Persistent banner at the top of the screen indicating "No Internet Connection". Disappears when back online.
- **Toast Notifications:**
  - **Elements:** Small, transient popups at the bottom or top of the screen for brief feedback (e.g., "Address Saved", "Copied to clipboard", "Network Error").


