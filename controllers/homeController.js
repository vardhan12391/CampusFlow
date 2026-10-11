/**
 * controllers/homeController.js
 * The landing page. If someone is already logged in, send them straight to
 * the dashboard that matches their role.
 */
function homePage(req, res) {
  if (req.user) {
    const dashboardByRole = { student: '/student', staff: '/staff', admin: '/admin' };
    return res.redirect(dashboardByRole[req.user.role] || '/student');
  }

  res.render('home', { title: 'CampusFlow' });
}

module.exports = { homePage };
