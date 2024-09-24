let slideIndex = [1, 1, 1];
let slideId = ["mySlides1", "mySlides2", "mySlides3"];

//Init slides
showSlides(1, 0);
showSlides(1, 1);
showSlides(1, 2);
//showSlides(1, 3);
//showSlides(1, 4);
//showSlides(1, 5);

//, "mySlides3", "mySlides4", "mySlides5", "mySlides6"

function plusSlides(n, no) {
    showSlides(slideIndex[no] += n, no); //Adjust current slide and show the next one
  }
  
  function currentSlide(n, no) {
      showSlides(slideIndex[no] = n, no); // Jump to a specific slide (dots)
    }
  
    //n slide #, no slide index
  function showSlides(n, no) {
    let i;
    let slides = document.getElementsByClassName(slideId[no]);  // Get all slides in the current slideshow

    // Ensure slideIndex loops within the correct number of slides
    if (n > slides.length) { slideIndex[no] = 1; }  // Go back to first slide if beyond last
    if (n < 1) { slideIndex[no] = slides.length; }  // Go to last slide if below 1

    // Hide all slides in the current slideshow
    for (i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
    }

    // Display the current slide
    slides[slideIndex[no] - 1].style.display = "block";

    console.log(`Slideshow ${no + 1}: Showing slide ${slideIndex[no]} of ${slides.length}`);
  }
