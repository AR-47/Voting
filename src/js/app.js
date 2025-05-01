// Import necessary libraries
const Web3 = require('web3');
const contract = require('@truffle/contract');
const votingArtifacts = require('../../build/contracts/Voting.json');

// Define the main application object
window.App = {
  account: null, // To store the user's account address
  VotingContractSpec: null, // To store the contract specification
  votingInstance: null, // To store the deployed contract instance

  // --- Initialization Function ---
  eventStart: async function() { // Make the function async
    try {
      // Request account access if needed using the modern method
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        console.error("No accounts found. Please connect Metamask.");
        $("#accountAddress").html("Error: No account detected. Please connect Metamask.");
        return; // Stop initialization if no accounts
      }
      App.account = accounts[0]; // Use the first account provided by Metamask
      $("#accountAddress").html("Your Account: " + App.account);
      console.log("Using account:", App.account);

      // Initialize contract specification object
      App.VotingContractSpec = contract(votingArtifacts);
      // Set the provider for the contract
      App.VotingContractSpec.setProvider(window.ethereum);

      // Set default transaction parameters AFTER getting the account
      // This ensures the 'from' address is set correctly
      App.VotingContractSpec.defaults({ from: App.account, gas: 6654755 });
      console.log("Contract defaults set with from:", App.account);

      // Get the deployed contract instance
      App.votingInstance = await App.VotingContractSpec.deployed();
      console.log("Contract instance obtained at:", App.votingInstance.address);

      // --- Attach Button Event Handlers ---
      // Use jQuery's document ready to ensure elements exist
      $(document).ready(function() {
        App.attachEventHandlers();
      });

      // --- Load Initial Data ---
      // Load voting dates and candidate list initially
      App.loadVotingDates();
      App.loadCandidatesAndCheckVote();

    } catch (error) {
      console.error("Could not connect to Metamask or initialize app:", error);
      $("#accountAddress").html("Error connecting wallet. Please ensure Metamask is installed, unlocked, and connected.");
      // Optionally disable buttons or show a more prominent error message
      $("#voteButton")?.attr("disabled", true); // Disable vote button if on index.html
      $("#addCandidate")?.attr("disabled", true); // Disable admin buttons if on admin.html
      $("#addDate")?.attr("disabled", true);
    }
  }, // End eventStart

  // --- Event Handlers ---
  attachEventHandlers: function() {
    // Add Candidate Button (Admin Page)
    $('#addCandidate').click(async function(event) {
      event.preventDefault(); // Prevent potential form submission
      var nameCandidate = $('#name').val();
      var partyCandidate = $('#party').val();
      if (!nameCandidate || !partyCandidate) {
          $("#Aday").text("Please enter both candidate name and party.").css('color', 'red');
          return;
      }
      console.log("Attempting to add candidate:", nameCandidate, partyCandidate, "from", App.account);
      $("#Aday").text("Adding candidate...").css('color', 'white'); // Feedback
      try {
        // Use the stored instance
        const result = await App.votingInstance.addCandidate(nameCandidate, partyCandidate);
        console.log("Add candidate transaction result:", result);
        $("#Aday").text("Candidate Added Successfully! Tx: " + result.tx.substring(0, 10) + "...").css('color', 'lightgreen');
        $('#name').val(''); // Clear input fields on success
        $('#party').val('');
        App.loadCandidatesAndCheckVote(); // Reload candidate list
      } catch (err) {
        console.error("ERROR adding candidate! " + err.message);
        $("#Aday").text("Error adding candidate: " + err.message).css('color', 'red');
      }
    });

    // Define Dates Button (Admin Page)
    $('#addDate').click(async function(event) {
      event.preventDefault();
      var startDateInput = document.getElementById("startDate").value;
      var endDateInput = document.getElementById("endDate").value;
      if (!startDateInput || !endDateInput) {
          $("#Aday").text("Please select both start and end dates.").css('color', 'red');
          return;
      }
      // Parse dates and convert to UNIX timestamp (seconds)
      var startDate = Date.parse(startDateInput) / 1000;
      var endDate = Date.parse(endDateInput) / 1000;

      if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
           $("#Aday").text("Invalid date selection. End date must be after start date.").css('color', 'red');
           return;
      }

      console.log("Attempting to set dates:", startDate, endDate, "from", App.account);
       $("#Aday").text("Setting dates...").css('color', 'white'); // Feedback
      try {
        const result = await App.votingInstance.setDates(startDate, endDate);
        console.log("Set dates transaction result:", result);
        $("#Aday").text("Dates Defined Successfully! Tx: " + result.tx.substring(0, 10) + "...").css('color', 'lightgreen');
        App.loadVotingDates(); // Reload dates display
      } catch (err) {
        console.error("ERROR setting dates! " + err.message);
        $("#Aday").text("Error setting dates: " + err.message).css('color', 'red');
      }
    });

    // Vote Button (Voter Page - index.html)
    // Check if the voteButton exists before attaching listener
    if ($('#voteButton').length) {
        $('#voteButton').click(App.castVote); // Use App.castVote function
    }

  }, // End attachEventHandlers

  // --- Data Loading Functions ---
  loadVotingDates: async function() {
    if (!App.votingInstance) return;
    try {
      const result = await App.votingInstance.getDates();
      // Check if dates are actually set (non-zero)
      if (result[0] && result[1] && result[0].toNumber() > 0) {
        var startDate = new Date(result[0].toNumber() * 1000); // Use toNumber() for BigNumbers
        var endDate = new Date(result[1].toNumber() * 1000);
        $("#dates").text(startDate.toDateString() + " - " + endDate.toDateString());
      } else {
        $("#dates").text("Not Defined Yet");
      }
    } catch (err) {
      console.error("ERROR getting dates! " + err.message);
      $("#dates").text("Error loading dates");
    }
  },

  loadCandidatesAndCheckVote: async function() {
    if (!App.votingInstance) return;
    $("#boxCandidate").empty(); // Clear existing table rows
    $("#msg").html(""); // Clear previous messages
    try {
      const count = await App.votingInstance.getCountCandidates();
      const countCandidates = count.toNumber(); // Use toNumber()
      console.log("Number of candidates:", countCandidates);

      if (countCandidates === 0) {
         $("#boxCandidate").append("<tr><td colspan='3'>No candidates registered yet.</td></tr>");
      } else {
          var candidatePromises = [];
          for (var i = 0; i < countCandidates; i++) {
            candidatePromises.push(App.votingInstance.getCandidate(i + 1));
          }
          const candidatesData = await Promise.all(candidatePromises);

          candidatesData.forEach(function(data) {
            var id = data[0].toNumber();
            var name = data[1];
            var party = data[2];
            var voteCount = data[3].toNumber();

            // Only show radio button on the voter page (index.html)
            var radioInput = window.location.pathname.includes('index.html') ?
                              `<input class="form-check-input" type="radio" name="candidate" value="${id}" id="candidate-${id}"> ` : '';
            var viewCandidates = `<tr><td> ${radioInput}${name}</td><td>${party}</td><td>${voteCount}</td></tr>`;
            $("#boxCandidate").append(viewCandidates);
          });
      }

      // Only check vote status and enable button if on the voter page
      if (window.location.pathname.includes('index.html')) {
        const voted = await App.votingInstance.checkVote();
        console.log("Has voted:", voted);
        if (!voted) {
          $("#voteButton").attr("disabled", false); // Enable voting button
        } else {
          $("#voteButton").attr("disabled", true); // Disable if already voted
          $("#msg").html("<p>You have already voted.</p>").css('color', 'lightgreen');
        }
      }

    } catch (err) {
      console.error("Error loading candidates or checking vote status:", err);
       $("#boxCandidate").append("<tr><td colspan='3'>Error loading candidates.</td></tr>");
    }
  },

  // --- Action Functions ---
  castVote: async function() {
    if (!App.votingInstance) return;
    var candidateID = $("input[name='candidate']:checked").val();
    if (!candidateID) {
      $("#msg").html("<p>Please select a candidate to vote for.</p>").css('color', 'red');
      return;
    }
    $("#msg").html("<p>Submitting vote...</p>").css('color', 'white'); // Feedback
    $("#voteButton").attr("disabled", true); // Disable button during transaction

    try {
      console.log("Voting for candidate:", candidateID, "from", App.account);
      const result = await App.votingInstance.vote(parseInt(candidateID)); // Rely on defaults for 'from'
      console.log("Vote transaction result:", result);
      $("#msg").html("<p>Voted Successfully! Tx: " + result.tx.substring(0, 10) + "...</p>").css('color', 'lightgreen');
      App.loadCandidatesAndCheckVote(); // Update vote counts and button status
    } catch (err) {
      console.error("ERROR voting! " + err.message);
      $("#msg").html("<p>Error submitting vote: " + err.message + "</p>").css('color', 'red');
      // Re-enable button only if the error wasn't because they already voted
      try {
          const voted = await App.votingInstance.checkVote();
          if (!voted) $("#voteButton").attr("disabled", false);
      } catch (checkErr) {
          console.error("Error re-checking vote status:", checkErr);
      }
    }
  } // End castVote

}; // End App object

// --- Window Load Event Listener ---
// This starts the application initialization when the window loads
window.addEventListener("load", function() {
  // Modern dapp browsers inject ethereum
  if (typeof window.ethereum !== "undefined") {
    console.log("MetaMask (or compatible wallet) detected.");
    // We don't need to create a new Web3 instance if using Metamask's injected provider
    App.eventStart(); // Call the async starter function
  }
  // Legacy dapp browsers (less common now)
  else if (typeof web3 !== "undefined") {
     console.warn("Using legacy web3 detected from external source. You should consider using Metamask.");
     App.VotingContractSpec = contract(votingArtifacts);
     App.VotingContractSpec.setProvider(web3.currentProvider);
     // Need to manually get account for legacy web3 if needed, e.g., web3.eth.getAccounts
     // This path might need more specific handling depending on the legacy provider
     alert("Legacy web3 detected. Functionality may be limited.");
  }
  // Non-dapp browsers
  else {
    console.warn("No web3 detected. Please install MetaMask!");
    $("#accountAddress").html("MetaMask not detected. Please install MetaMask to use this application.");
    alert("MetaMask not detected. Please install MetaMask to use this application.");
    // Optionally disable UI elements further
  }
});