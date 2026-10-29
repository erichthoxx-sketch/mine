// Правила доступа Firebase — те же, что в firestore.rules (тест следит, чтобы совпадали).
// Админка показывает их владелице, если сайт ещё не разрешён в Firebase.
export const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Каждый пользователь видит и меняет только свои данные.
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Сайт автора: читать может любой посетитель, менять — только владелица.
    // Первый вход в админку записывает её в site/owner, потом владельца не поменять.
    function siteOwner() {
      return request.auth != null
        && exists(/databases/$(database)/documents/site/owner)
        && get(/databases/$(database)/documents/site/owner).data.uid == request.auth.uid;
    }
    match /site/{doc} {
      allow read: if true;
      allow create: if (doc == 'owner' && request.auth != null && request.resource.data.uid == request.auth.uid)
        || (doc != 'owner' && siteOwner());
      allow update, delete: if doc != 'owner' && siteOwner();
    }
    match /site_img/{id} {
      allow read: if true;
      allow write: if siteOwner();
    }
    // Подписчики сайта: оставить почту может любой посетитель, читать и удалять — только владелица
    match /site_subs/{id} {
      allow create: if request.resource.data.keys().hasOnly(['email', 'at', 'src', 'consent', 'name'])
        && (!('name' in request.resource.data) || (request.resource.data.name is string && request.resource.data.name.size() < 80))
        && request.resource.data.email is string
        && request.resource.data.email.size() < 200
        && request.resource.data.email.matches('^[^@ ]+@[^@ ]+[.][^@ ]+$')
        && request.resource.data.consent == true;
      allow read, update, delete: if siteOwner();
    }
    // Розыгрыш по пятницам: читательница с кабинетом записывает только себя (какую книгу хочет);
    // все записи, промокоды и победы видит владелица; победительница видит только свою победу
    match /site_raffle/{uid} {
      allow read, delete: if (request.auth != null && request.auth.uid == uid) || siteOwner();
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['uid', 'email', 'name', 'book', 'at'])
        && request.resource.data.uid == uid
        && request.resource.data.book is string && request.resource.data.book.size() < 100
        && request.resource.data.name is string && request.resource.data.name.size() < 80;
    }
    match /site_wins/{id} {
      allow read: if siteOwner() || (request.auth != null && resource.data.uid == request.auth.uid);
      allow write: if siteOwner();
    }
    match /site_codes/{id} {
      allow read, write: if siteOwner();
    }
  }
}
`;
