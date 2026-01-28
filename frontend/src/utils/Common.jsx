export function generateUserId() {

  if (!localStorage.getItem("userId")) {
      localStorage.setItem("userId", crypto.randomUUID());
    }
    const userId = localStorage.getItem("userId");

    return userId;
}