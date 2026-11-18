// Scenario estimate only: approved hours per completed enrollment in a 12-month window.
// Aggregate submissions cannot verify approval, attendance, or cross-program person caps.
export function estimateRac(program) {
  const hours = Math.max(0, Number(program.courseHours) || 0);
  const completed = Math.max(0, Math.floor(Number(program.participantsCompleted) || 0));
  const daysPerEnrollment = Math.min(40, Math.floor(hours / 52) * 10);
  return { hours, completed, daysPerEnrollment, days: daysPerEnrollment * completed };
}

export function estimatedSavings(days, dailyRate = 59) {
  return Math.max(0, Number(days) || 0) * Math.max(0, Number(dailyRate) || 0);
}
