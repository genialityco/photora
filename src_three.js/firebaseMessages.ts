import { db, serverTimestamp } from "./firebaseConfig";
import { collection, addDoc } from "firebase/firestore";

export async function saveMessage(messageText: string) {
  try {
    const docRef = await addDoc(collection(db, "messages"), {
      message: messageText,
      timestamp: serverTimestamp()
    });
    console.log("Mensaje guardado con id:", docRef.id);
  } catch (error) {
    console.error("Error al guardar el mensaje:", error);
  }
}
