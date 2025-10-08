
# 🛠️ Spintel Backend API — Developer Onboarding Guide

Welcome to the **Spintel Backend** codebase! This guide will help you set up, understand, and interact with the backend services required for frontend integration.

---

## 📁 Project Structure

```
Spintel/
├── db/
│   └── connection.js          # PostgreSQL DB connection setup
├── middleware/
│   └── auth.js                # JWT auth middleware
├── routes/
│   ├── users.js               # User registration, login, auth
│   ├── approval.js            # User approval, rejection, role updates
│   ├── consultants.js         # Consultant endpoints
│   ├── organisation.js        # Organisation endpoints
│   ├── screens.js             # Screens fetch endpoint
│   ├── counts.js              # Dashboard count endpoints
│   └── service_agreement.js   # Document uploads for customer/consultant
│   └── roles.js   # Document uploads for customer/consultant
├── server.js                  # Entry point for backend server
├── package.json               # NPM config
└── README.md                  # This guide
```

---

## 🧑‍💻 Prerequisites

- Node.js `v16+` (install from [nodejs.org](https://nodejs.org/))
- PostgreSQL (ensure database is running and accessible)
- Postman (optional, for testing API endpoints)

---

## ⚙️ Getting Started

### 1. Clone the Repo

```bash
git clone https://your-repo-url.git
cd Spintel
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
node server.js
```

The server will start on: `http://localhost:3300`

---

## 🔌 Backend API Endpoints

### 🔐 Authentication & User Routes

| Method | Endpoint           | Description                         |
|--------|--------------------|-------------------------------------|
| POST   | `/users`           | Register a new user (pending state) |
| POST   | `/users/login`     | Login and get JWT token             |
| GET    | `/users`           | Fetch users (JWT protected)         |
| POST   | `/users/inactive`  | Inactivate an existing user         |
| PUT    | `/users/role/:id`  | Update a user's role                |
| DELETE | `/users/:id`       | Delete a user                       |

> 🔸 JWT Token is required in `Authorization` header for `/users`:
```
Authorization: Bearer <your_token>
```

---

### ✅ Approval Routes

| Method | Endpoint                            | Description                        |
|--------|-------------------------------------|------------------------------------|
| POST   | `/approval/approve/:user_id`        | Approve user & move to main table |
| POST   | `/approval/reject`                  | Reject user in approval list       |

---

### 📊 Dashboard Counts

| Method | Endpoint              | Description                       |
|--------|------------------------|-----------------------------------|
| GET    | `/counts/consultants`  | Get total consultant count        |
| GET    | `/counts/users`        | Get total user count              |
| GET    | `/counts/organisation` | Get total organisation count      |

---

### 👥 Consultant Routes

| Method | Endpoint        | Description          |
|--------|------------------|----------------------|
| POST   | `/consultants`   | Add a consultant     |
| GET    | `/consultants`   | Get all consultants  |

---

### 🏢 Organisation Routes

| Method | Endpoint         | Description            |
|--------|------------------|------------------------|
| POST   | `/organisation`  | Add organisation       |
| GET    | `/organisation`  | Get all organisations  |

---

### 🖥️ Screen Routes

| Method | Endpoint      | Description         |
|--------|----------------|---------------------|
| GET    | `/screens`     | Get list of screens |

---

### 📂 Service Agreement Routes

| Method | Endpoint                                       | Description                                  |
|--------|------------------------------------------------|----------------------------------------------|
| POST   | `/service_agreement/customer`                  | Upload service agreement (customer)          |
| POST   | `/service_agreement/consultant`                | Upload service agreement (consultant)        |
| GET    | `/service_agreement/customer`                  | Get all customer service agreements          |
| GET    | `/service_agreement/consultant`                | Get all consultant service agreements        |

### 📂 roles Routes

| Method | Endpoint                                       | Description                                  |
|--------|------------------------------------------------|----------------------------------------------|
| POST   | `/roles`                                       | Upload service agreement (customer)          |
| GET    | `/roles/:role_id`                              | Upload service agreement (consultant)        |
| PUT    | `/roles/:role_id/permissions`                  | Get all customer service agreements          |
| DELETE | `/roles/:role_id`                              | Get all consultant service agreements        |





---

## 🧪 Testing with Postman

You can use Postman to test endpoints. Steps:

1. **POST** `/users` → Register a user  
2. **POST** `/users/login` → Get JWT token  
3. Use token in header for protected routes like `/users`

---

## 🗃️ Database Info

- **DB Engine:** PostgreSQL
- **Port:** `5433`
- **Database:** `postgres`
- **Username:** `postgres`
- **Password:** `Qbic@2025`

Change these settings in `/db/connection.js` if needed.

---

## 🔐 JWT Token Info

- Secret key: hardcoded in `users.js` as `yourSuperSecretKey123`  
- Validity: 1 hour  
- Payload includes: `user_id`, `email`, `org_code`

---

## 📌 Notes for Frontend Integration

- Ensure token-based authentication is used for protected endpoints.
- All API responses are in JSON.
- Passwords are hashed using `bcrypt`.
- User registration is first saved in `approval_list` for moderation.
- Use correct route groups (e.g. `/approval`, `/counts`, `/service_agreement`) during integration.

---

