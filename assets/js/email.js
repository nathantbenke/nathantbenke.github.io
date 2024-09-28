//email.js
function SendMail() {
    var params = {
        from_name : document.getElementById("fullName").value,
        email_id : document.getElementById("email_id").value,
        subject : document.getElementById("subject").value,
        message : document.getElementById("message").value,
    };

    const serviceID = "service_id3xvvf"; 
    const templateID = "template_p1unncs"; 

    emailjs.send(serviceID, templateID, params)
    .then((res) => {
    alert("Your message has been sent successfully!");
    // Clear the text boxes after successful email sending
    document.getElementById("fullName").value = "";
    document.getElementById("email_id").value = "";
    document.getElementById("subject").value = "";
    document.getElementById("message").value = "";
    })
    .catch((err) => {
    alert("An error occurred while sending your message. Please try again.");
    console.error(err);
    });
}