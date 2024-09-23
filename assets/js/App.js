document.addEventListener("DOMContentLoaded", function() {
    const timelineSection = document.querySelector('#Timeline');
    const timelineContainers = document.querySelectorAll('.timeline-container');

    // IntersectionObserver for the timeline section (moveline animation)
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                timelineSection.classList.add('animate-line'); // Start the line animation
                sectionObserver.unobserve(entry.target); // Only animate once
            }
        });
    }, {
        threshold: 0.1 // Trigger when 10% of the section is visible
    });

    // Observe the timeline section
    sectionObserver.observe(timelineSection);

    // IntersectionObserver for each timeline container (movedown animation)
    const containerObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show'); // Trigger movedown animation
                containerObserver.unobserve(entry.target); // Only animate once
            }
        });
    }, {
        threshold: 0.1 // Trigger when 10% of the element is visible
    });

    // Observe each timeline container
    timelineContainers.forEach((container) => containerObserver.observe(container));
});