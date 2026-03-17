import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'demo',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo-no-project',
  appId: 'demo-app',
};

function buildContext(name, mockUserToken) {
  const app = initializeApp(firebaseConfig, name);
  const db = getFirestore(app);
  if (typeof mockUserToken === 'undefined') {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } else {
    connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken });
  }
  return { app, db };
}

const userA = buildContext('userA', { sub: 'user_a', user_id: 'user_a' });
const userB = buildContext('userB', { sub: 'user_b', user_id: 'user_b' });
const owner = buildContext('owner', 'owner');
const anon = buildContext('anon');

let pass = 0;
let fail = 0;

async function expectSucceeds(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`FAIL: ${name}`);
    console.log(`  -> ${err?.code || err?.message || err}`);
  }
}

async function expectFails(name, fn) {
  try {
    await fn();
    fail += 1;
    console.log(`FAIL: ${name}`);
    console.log('  -> expected operation to fail, but it succeeded');
  } catch {
    pass += 1;
    console.log(`PASS: ${name}`);
  }
}

async function run() {
  const suffix = `${Date.now()}`;
  const closetDoc = doc(userA.db, 'closets', `closet-${suffix}`);
  const publicClosetDoc = doc(userA.db, 'closets', `closet-public-${suffix}`);
  const privateClosetDoc = doc(userA.db, 'closets', `closet-private-${suffix}`);
  const prefDoc = doc(userA.db, 'preferences', 'user_a');
  const notifDoc = doc(owner.db, 'notifications', `notif-${suffix}`);
  const threadDoc = doc(userA.db, 'threads', `thread-${suffix}`);
  const threadMsgCol = collection(userA.db, 'threads', `thread-${suffix}`, 'messages');
  const threadMsgColUserB = collection(userB.db, 'threads', `thread-${suffix}`, 'messages');

  await expectFails('Closet create fails without required userId', async () => {
    await setDoc(doc(userA.db, 'closets', `closet-bad-${suffix}`), {
      imageUrl: 'https://example.com/a.png',
      category: 'tops',
      type: 'top',
      color: 'blue',
    });
  });

  await expectSucceeds('Closet create succeeds with required fields + matching owner', async () => {
    await setDoc(closetDoc, {
      userId: 'user_a',
      imageUrl: 'https://example.com/a.png',
      category: 'tops',
      type: 'top',
      color: 'blue',
    });
  });

  await expectFails('Closet update fails when attempting to change userId', async () => {
    await updateDoc(closetDoc, { userId: 'user_b' });
  });

  await expectSucceeds('Public closet doc create succeeds with isPublic=true', async () => {
    await setDoc(publicClosetDoc, {
      userId: 'user_a',
      imageUrl: 'https://example.com/public.png',
      category: 'tops',
      type: 'top',
      color: 'green',
      isPublic: true,
    });
  });

  await expectSucceeds('Private closet doc create succeeds with isPublic=false', async () => {
    await setDoc(privateClosetDoc, {
      userId: 'user_a',
      imageUrl: 'https://example.com/private.png',
      category: 'tops',
      type: 'top',
      color: 'black',
      isPublic: false,
    });
  });

  await expectSucceeds('Public closet doc is readable by another signed-in user', async () => {
    await getDoc(doc(userB.db, 'closets', `closet-public-${suffix}`));
  });

  await expectSucceeds('Public closet doc is readable by unauthenticated user', async () => {
    await getDoc(doc(anon.db, 'closets', `closet-public-${suffix}`));
  });

  await expectFails('Private closet doc is not readable by another signed-in user', async () => {
    await getDoc(doc(userB.db, 'closets', `closet-private-${suffix}`));
  });

  await expectFails('Private closet doc is not readable by unauthenticated user', async () => {
    await getDoc(doc(anon.db, 'closets', `closet-private-${suffix}`));
  });

  await expectSucceeds('Preferences owner write succeeds with boolean fields', async () => {
    await setDoc(prefDoc, { avoidDenimOnDenim: true, preferCasual: false });
  });

  await expectFails('Preferences write fails for invalid field type', async () => {
    await setDoc(prefDoc, { preferCasual: 'yes' });
  });

  await expectSucceeds('Owner-seeded notification write works (for test seeding)', async () => {
    await setDoc(notifDoc, {
      userId: 'user_a',
      title: 'Test notification',
      body: 'seeded by owner',
    });
  });

  await expectSucceeds('Notification read succeeds for owner user', async () => {
    await getDoc(doc(userA.db, 'notifications', `notif-${suffix}`));
  });

  await expectFails('Notification read fails for non-owner user', async () => {
    await getDoc(doc(userB.db, 'notifications', `notif-${suffix}`));
  });

  await expectSucceeds('Thread create succeeds when current user in participantIds', async () => {
    await setDoc(threadDoc, {
      participantIds: ['user_a', 'user_b'],
      updatedAt: Date.now(),
      lastMessageText: 'hello',
    });
  });

  await expectFails('Thread create fails when current user not in participantIds', async () => {
    await setDoc(doc(userA.db, 'threads', `thread-bad-${suffix}`), {
      participantIds: ['user_b', 'user_c'],
      updatedAt: Date.now(),
    });
  });

  await expectFails('Thread update fails if participantIds changed', async () => {
    await updateDoc(threadDoc, {
      participantIds: ['user_a', 'user_c'],
      updatedAt: Date.now(),
    });
  });

  await expectSucceeds('Thread message create succeeds for participant + senderId match', async () => {
    await addDoc(threadMsgCol, {
      senderId: 'user_a',
      text: 'hello from user_a',
      createdAt: Date.now(),
    });
  });

  await expectFails('Thread message create fails when senderId does not match auth user', async () => {
    await addDoc(threadMsgColUserB, {
      senderId: 'user_a',
      text: 'spoof attempt',
      createdAt: Date.now(),
    });
  });

  await expectFails('Thread message create fails when text is empty', async () => {
    await addDoc(threadMsgCol, {
      senderId: 'user_a',
      text: '',
      createdAt: Date.now(),
    });
  });

  console.log('');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);

  await Promise.all([deleteApp(userA.app), deleteApp(userB.app), deleteApp(owner.app), deleteApp(anon.app)]);

  if (fail > 0) {
    process.exit(1);
  }
}

run().catch(async (err) => {
  console.error('Unexpected test runner error:', err);
  await Promise.allSettled([deleteApp(userA.app), deleteApp(userB.app), deleteApp(owner.app), deleteApp(anon.app)]);
  process.exit(1);
});
