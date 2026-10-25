// Firebase's web config identifies the project; it is not a server credential.
const firebaseConfig = {
  apiKey: 'AIzaSyCI-GZSIwSNzJq8R3WockZ9guTsZLGwrsY',
  authDomain: 'tpw-hackathon.firebaseapp.com',
  projectId: 'tpw-hackathon',
  storageBucket: 'tpw-hackathon.firebasestorage.app',
  messagingSenderId: '778729098251',
  appId: '1:778729098251:web:397f68456dd76a3878cb0e'
};

export function submissionDocument(submission) {
  const value = (program, key) => Object.entries(program.values)
    .find(([name]) => name.endsWith(`[${key}]`))?.[1] ?? '';
  const programs = submission.programs.map(program => ({
    ...(program.id ? { id: program.id } : {}),
    name: program.name,
    assignments: program.assignments,
    status: value(program, 'scheduled_status'),
    startDate: value(program, 'start_date'),
    endDate: value(program, 'end_date'),
    courseHours: Number(value(program, 'course_hours')) || 0,
    participants: Number(value(program, 'participants')) || 0,
    participantsCompleted: Number(value(program, 'participants_completed')) || 0
  }));
  return {
    schemaVersion: 1,
    source: 'form-demo',
    organization: submission.organization,
    ...(submission.orgId ? { orgId: submission.orgId, previousSubmissionId: submission.previousSubmissionId || null } : {}),
    ...(submission.reportingPeriod ? { reportingPeriod: submission.reportingPeriod } : {}),
    prisons: submission.prisons,
    programs,
    submittedAt: submission.submittedAt,
    totals: programs.reduce((totals, program) => ({
      programs: totals.programs + 1,
      courseHours: totals.courseHours + program.courseHours,
      participants: totals.participants + program.participants,
      participantsCompleted: totals.participantsCompleted + program.participantsCompleted,
      participantHoursDelivered: totals.participantHoursDelivered + program.courseHours * program.participantsCompleted
    }), { programs: 0, courseHours: 0, participants: 0, participantsCompleted: 0, participantHoursDelivered: 0 })
  };
}

let client;
export async function firestoreClient() {
  // Lazy loading keeps the rest of the form usable if Firebase cannot load.
  if (!client) {
    client = Promise.all([
      import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js')
    ]).then(([app, firestore]) => ({
      ...firestore,
      db: firestore.getFirestore(app.initializeApp(firebaseConfig))
    })).catch(error => { client = undefined; throw error; });
  }
  return client;
}

export async function saveSubmission(submission, id) {
  const { db, doc, setDoc, serverTimestamp } = await firestoreClient();
  // Reuse the ID on retry so a delayed response cannot create duplicate records.
  await setDoc(doc(db, 'submissions', id), {
    ...submissionDocument(submission),
    receivedAt: serverTimestamp()
  });
  return id;
}
