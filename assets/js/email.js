//email.js
function SendMail() {
    var params = {
        from_name : document.getElementById("fullName").value,
        email_id : document.getElementById("email_id").value,
        subject : document.getElementById("subject").value,
        message : document.getElementById("message").value
    };

    emailjs.send("service_id3xvvf", "template_p1unncs", params).then(
        (response) => {
            console.log("Success! " + res.status);             
        },
        (error) => {
            console.log("Failed... " + error);             
        }, 
    ); 
}