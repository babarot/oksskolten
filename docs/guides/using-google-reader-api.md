# Using the Google Reader API

Oksskolten exposes a Google Reader–compatible endpoint at `/reader/api/0/`. This lets native feed reader apps like **NetNewsWire**, **Reeder**, and others sync feeds, articles, read/unread state, and starred items directly with your Oksskolten instance.

## Setup

No additional configuration is required. Use your existing Oksskolten account credentials (email and password) to authenticate.

### Connect your feed reader

In your feed reader, choose **FreshRSS** or **Google Reader** as the account type and use the following settings:

| Field | Value |
|---|---|
| **Server URL** | `https://your-oksskolten.example.com` |
| **Username** | Your Oksskolten email address |
| **Password** | Your Oksskolten account password |

## NetNewsWire

1. Open NetNewsWire → **Add Feed Account**
2. Choose **FreshRSS**
3. Enter your server URL, email, and password
4. NetNewsWire will authenticate and download your feeds

## Supported operations

| Feature | Supported |
|---|---|
| List subscriptions | ✅ |
| List folders/tags | ✅ |
| Unread articles | ✅ |
| Starred articles | ✅ |
| Mark as read/unread | ✅ |
| Star/unstar articles | ✅ |
| Article content | ✅ |

## Authentication

The Google Reader API uses a token-based auth flow:

1. Client POSTs credentials to `/accounts/ClientLogin`
2. Server returns a JWT token in the response body as `Auth=<token>`
3. Subsequent requests include `Authorization: GoogleLogin auth=<token>`

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/accounts/ClientLogin` | Authenticate and get token |
| `GET` | `/reader/api/0/user-info` | Get user info |
| `GET` | `/reader/api/0/tag/list` | List folders/tags |
| `GET` | `/reader/api/0/subscription/list` | List subscriptions |
| `GET` | `/reader/api/0/stream/items/ids` | Get article IDs for a stream |
| `POST` | `/reader/api/0/stream/items/contents` | Get article content by IDs |
| `GET` | `/reader/api/0/stream/contents/<stream>` | Get article content for a stream |
| `POST` | `/reader/api/0/edit-tag` | Mark articles read/unread/starred |
| `POST` | `/reader/api/0/mark-all-as-read` | Mark all articles in a stream as read |
