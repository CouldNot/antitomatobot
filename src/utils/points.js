import { doc, getDoc, setDoc } from "firebase/firestore";

export async function givePoints(db, userId, pointsToAdd) {
  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    const currentPoints = docSnap.exists()
      ? Number(docSnap.data().points ?? 0)
      : 0;

    await setDoc(
      userRef,
      { points: currentPoints + pointsToAdd },
      { merge: true }
    );
  } catch (error) {
    console.error("Error updating points:", error);
    throw error;
  }
}

export async function giveStrokes(db, userId, strokesToAdd) {
  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    const currentStrokes = docSnap.exists()
      ? Number(docSnap.data().strokes ?? 0)
      : 0;

    await setDoc(
      userRef,
      { strokes: currentStrokes + strokesToAdd },
      { merge: true }
    );
  } catch (error) {
    console.error("Error updating strokes:", error);
    throw error;
  }
}
