# Setup

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com and click **Add project**.
2. Give it a name, finish the wizard (Google Analytics is optional).

## 2. Register a web app
1. In the project overview, click the **</>** (web) icon to add a web app.
2. Give it a nickname, skip Firebase Hosting for now.
3. Copy the `firebaseConfig` object it shows you.
4. Paste those values into `firebase-config.js` in this project.

## 3. Enable Authentication
1. In the Firebase console, go to **Build > Authentication > Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Also enable **Google**, and set a support email when prompted.

## 4. Create the Firestore database
1. Go to **Build > Firestore Database > Create database**.
2. Start in **production mode**, pick a region.

## 5. Set Firestore security rules
Go to the **Rules** tab of Firestore and replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{eventId} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.hostId == request.auth.uid;
      allow update, delete: if request.auth != null
                    && resource.data.hostId == request.auth.uid;

      match /attendees/{attendeeId} {
        allow read: if true;
        allow create: if request.resource.data.name is string
                      && request.resource.data.name.size() > 0
                      && request.resource.data.name.size() < 100;
        allow update, delete: if false;
      }
    }
  }
}
```

Click **Publish**.

## 6. Run the app
Since the scripts use ES modules, open it through a local server (not `file://`):

- VS Code: install the "Live Server" extension, right-click `index.html` -> "Open with Live Server", or
- `npx serve .` from this folder, or
- `python -m http.server` and visit `http://localhost:8000`.

## How it works
- Sign up / log in on the home page (email+password or Google).
- Once logged in you land on **Your Events** — click **+ New Event** to create one.
- After creating an event you're taken to its page with a shareable link (`?event=<id>`) and a live guest list.
- Anyone who opens that link (no account needed) can type their name and RSVP.
- The host sees a "Delete Event" option on the event page; guests don't.
